import { google } from "googleapis";

// In-Memory Edge Cache for Serverless Functions
const globalCache = {
  db: null,
  cachedAt: 0,
  spreadsheetId: null,
};

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache TTL

/**
 * Initializes and returns authenticated Google Sheets and Drive clients.
 */
export function getGoogleAuth() {
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  let privateKey = process.env.GCP_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GCP credentials in environment variables (GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY)."
    );
  }

  // Handle escaped newline strings from environment variables
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  return { auth, sheets, drive };
}

/**
 * Resolves the Google Spreadsheet ID either from environment variable or by searching Google Drive.
 */
export async function getSpreadsheetId(forceRefresh = false) {
  if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID.trim()) {
    return process.env.GOOGLE_SHEET_ID.trim();
  }

  if (globalCache.spreadsheetId && !forceRefresh) {
    return globalCache.spreadsheetId;
  }

  const { drive } = getGoogleAuth();
  const sheetTitle =
    process.env.GOOGLE_SHEET_TITLE || "PS Cadet College - Master Examination Database";

  try {
    const res = await drive.files.list({
      q: `name = '${sheetTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    const files = res.data.files;
    if (files && files.length > 0) {
      globalCache.spreadsheetId = files[0].id;
      return files[0].id;
    }
  } catch (err) {
    console.error("Error searching drive for spreadsheet:", err);
  }

  throw new Error(`Could not find Google Spreadsheet titled "${sheetTitle}". Please check Service Account permissions or set GOOGLE_SHEET_ID.`);
}

/**
 * Parses raw 2D array from sheet tab into array of objects with normalized keys.
 */
function parseTabRows(data, tabName) {
  if (!data || data.length === 0) return [];
  const rawHeaders = data[0];
  const validCols = [];

  rawHeaders.forEach((h, idx) => {
    const name = String(h || "").trim();
    if (name) {
      validCols.push({ idx, name });
    }
  });

  if (validCols.length === 0) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row.some((cell) => String(cell || "").trim() !== "")) {
      continue;
    }

    const obj = {};
    validCols.forEach(({ idx, name }) => {
      obj[name] = String(row[idx] !== undefined && row[idx] !== null ? row[idx] : "").trim();
    });

    // Tab-specific normalizations
    if (tabName === "Students") {
      if (obj.Kit_No && !obj.Student_ID) obj.Student_ID = obj.Kit_No;
      if (obj.Student_ID && !obj.Kit_No) obj.Kit_No = obj.Student_ID;
      if (obj.Group && !obj.Stream) obj.Stream = obj.Group;
      if (obj.Stream && !obj.Group) obj.Group = obj.Stream;
      if (!obj.Name) {
        obj.Name = obj.Full_Name || obj["Full Name"] || obj.Student_Name || "";
      }
    } else if (tabName === "Marks_Log") {
      if (obj.Kit_No && !obj.Student_ID) obj.Student_ID = obj.Kit_No;
      if (obj.Student_ID && !obj.Kit_No) obj.Kit_No = obj.Student_ID;
    } else if (tabName === "Staff_Directory") {
      if (!obj.Name && obj.Full_Name) obj.Name = obj.Full_Name;
      if (!obj.Full_Name && obj.Name) obj.Full_Name = obj.Name;
    }

    rows.push(obj);
  }

  return rows;
}

/** Always read the approval list fresh so removing staff access takes effect promptly. */
export async function loadStaffDirectory() {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Staff_Directory'!A1:ZZ",
  });
  return parseTabRows(response.data.values || [], "Staff_Directory");
}

/**
 * Reads the authorization source tables without using the master-data cache.
 * Access revocations and teaching-scope changes therefore apply on the next API request.
 */
export async function loadAuthorizationData() {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      "'Staff_Directory'!A1:ZZ",
      "'Teaching_Assignments'!A1:ZZ",
    ],
  });
  const ranges = response.data.valueRanges || [];
  return {
    Staff_Directory: parseTabRows(ranges[0]?.values || [], "Staff_Directory"),
    Teaching_Assignments: parseTabRows(ranges[1]?.values || [], "Teaching_Assignments"),
  };
}

/** Reads selected tabs fresh for authorization decisions on protected records. */
export async function loadFreshDatabaseTabs(tabNames) {
  const allowedTabs = new Set([
    "Students",
    "Marks_Log",
    "Question_Papers_Log",
    "exam_scheme",
  ]);
  const tabs = Array.from(new Set(tabNames || [])).filter((tab) => allowedTabs.has(tab));
  if (tabs.length === 0) return {};

  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map((tab) => `'${tab}'!A1:ZZ`),
  });
  const ranges = response.data.valueRanges || [];
  return Object.fromEntries(
    tabs.map((tab, index) => [
      tab,
      parseTabRows(ranges[index]?.values || [], tab),
    ])
  );
}

/**
 * Loads all relational database tabs from the Google Sheet with intelligent in-memory caching.
 */
export async function loadMasterDatabase(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    globalCache.db &&
    now - globalCache.cachedAt < CACHE_TTL_MS
  ) {
    return { ...globalCache.db, _cached: true, _cachedAt: globalCache.cachedAt };
  }

  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId(forceRefresh);

  // 1. Get metadata to find available sheet tabs
  const metaRes = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const availableTabs = (metaRes.data.sheets || []).map(
    (s) => s.properties.title
  );

  const targetTabs = [
    "Students",
    "Staff_Directory",
    "Teaching_Assignments",
    "Grading_System",
    "exam_scheme",
    "Marks_Log",
    "Group_Subjects",
    "Subjects_Master",
    "Question_Papers_Log",
  ];

  const tabsToFetch = targetTabs.filter((t) => availableTabs.includes(t));

  // Batch fetch all tabs in a single API roundtrip to prevent quota throttling
  const ranges = tabsToFetch.map((tab) => `'${tab}'!A1:ZZ`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });

  const valueRanges = batchRes.data.valueRanges || [];
  const db = {};

  targetTabs.forEach((tab) => {
    db[tab] = [];
  });

  tabsToFetch.forEach((tab, index) => {
    const valRange = valueRanges[index];
    const data = valRange ? valRange.values || [] : [];
    db[tab] = parseTabRows(data, tab);
  });

  globalCache.db = db;
  globalCache.cachedAt = now;

  return { ...db, _cached: false, _cachedAt: now };
}

/**
 * Saves or updates student marks in the Marks_Log sheet.
 * Matches existing records by Submission_ID or composite key (Kit_No + Exam_ID + Subject).
 * Updates matching rows in-place using batchUpdate to preserve previous Submission_IDs,
 * and appends only genuinely new student records to prevent duplicate marks.
 */
export async function saveOrUpdateMarksLog(records) {
  if (!records || records.length === 0) {
    return { updatedCount: 0, insertedCount: 0, totalCount: 0 };
  }

  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();

  // 1. Fetch current rows from Marks_Log to locate row numbers and Submission_IDs
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Marks_Log'!A:E",
  });
  const currentValues = currentResponse.data.values || [];

  // Row 1 is header: [Submission_ID, Kit_No, Exam_ID, Subject, Marks_Obtained].
  const subIdToRow = new Map();
  const compositeToRow = new Map();
  const ambiguousSubIds = new Set();
  const ambiguousComposites = new Set();
  const normalizeKey = (value) => String(value || "").normalize("NFKC").trim().toLowerCase();

  for (let i = 1; i < currentValues.length; i++) {
    const row = currentValues[i];
    if (!row) continue;
    const sheetRowNumber = i + 1; // 1-based index in Google Sheets
    const rowSubId = String(row[0] || "").trim();
    const rowKitNo = String(row[1] || "").trim();
    const rowExamId = String(row[2] || "").trim().toLowerCase();
    const rowSubject = String(row[3] || "").trim().toLowerCase();
    const rowCompositeKey = rowKitNo && rowExamId && rowSubject
      ? `${normalizeKey(rowKitNo)}___${rowExamId}___${rowSubject}`
      : "";

    const subIdKey = normalizeKey(rowSubId);
    if (subIdKey) {
      if (subIdToRow.has(subIdKey)) ambiguousSubIds.add(subIdKey);
      else {
        subIdToRow.set(subIdKey, {
          rowNumber: sheetRowNumber,
          subId: rowSubId,
          compositeKey: rowCompositeKey,
        });
      }
    }

    if (rowCompositeKey) {
      if (compositeToRow.has(rowCompositeKey)) ambiguousComposites.add(rowCompositeKey);
      else {
        compositeToRow.set(rowCompositeKey, { rowNumber: sheetRowNumber, subId: rowSubId });
      }
    }
  }

  const updates = [];
  const inserts = [];
  const requestStudents = new Set();
  const requestSubmissionIds = new Set();
  const reservedSubmissionIds = new Set(subIdToRow.keys());
  const makeSubmissionId = () => {
    let candidate;
    do {
      candidate = `SUB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    } while (reservedSubmissionIds.has(normalizeKey(candidate)));
    reservedSubmissionIds.add(normalizeKey(candidate));
    return candidate;
  };

  for (const r of records) {
    const incomingSubId = String(r.Submission_ID || "").trim();
    const kitNo = String(r.Kit_No || r.Student_ID || "").trim();
    const examId = String(r.Exam_ID || "").trim();
    const subject = String(r.Subject || "").trim();
    const marks = String(r.Marks_Obtained !== undefined ? r.Marks_Obtained : "").trim();

    const incomingSubKey = normalizeKey(incomingSubId);
    const compositeKey = `${normalizeKey(kitNo)}___${normalizeKey(examId)}___${normalizeKey(subject)}`;
    if (requestStudents.has(compositeKey) || (incomingSubKey && requestSubmissionIds.has(incomingSubKey))) {
      throw new Error("Duplicate marks record reached the storage boundary.");
    }
    if (ambiguousComposites.has(compositeKey) || (incomingSubKey && ambiguousSubIds.has(incomingSubKey))) {
      throw new Error("Ambiguous marks record reached the storage boundary.");
    }
    requestStudents.add(compositeKey);
    if (incomingSubKey) requestSubmissionIds.add(incomingSubKey);

    const existingBySubmissionId = incomingSubKey ? subIdToRow.get(incomingSubKey) : null;
    if (incomingSubKey && !existingBySubmissionId) {
      throw new Error("Submission target changed before the marks write.");
    }
    if (
      existingBySubmissionId &&
      existingBySubmissionId.compositeKey !== compositeKey
    ) {
      throw new Error("Submission target no longer matches the marks record.");
    }
    const existing = existingBySubmissionId || compositeToRow.get(compositeKey);

    if (existing) {
      const targetSubId = existing.subId || incomingSubId || makeSubmissionId();
      updates.push({ rowNumber: existing.rowNumber, values: [targetSubId, kitNo, examId, subject, marks] });
    } else {
      const newSubId = incomingSubId || makeSubmissionId();
      inserts.push([newSubId, kitNo, examId, subject, marks]);
    }
  }

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const marksSheet = (meta.data.sheets || []).find(
    (sheet) => sheet.properties?.title === "Marks_Log"
  );
  if (!marksSheet) throw new Error("Marks_Log sheet is unavailable.");

  const sheetId = marksSheet.properties.sheetId;
  const toCellData = (values) => ({
    values: values.map((value, columnIndex) => ({
      userEnteredValue:
        columnIndex === 4 && value !== "Absent"
          ? { numberValue: Number(value) }
          : { stringValue: String(value) },
    })),
  });
  const requests = updates.map((update) => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: update.rowNumber - 1,
        endRowIndex: update.rowNumber,
        startColumnIndex: 0,
        endColumnIndex: 5,
      },
      rows: [toCellData(update.values)],
      fields: "userEnteredValue",
    },
  }));
  if (inserts.length > 0) {
    requests.push({
      appendCells: {
        sheetId,
        rows: inserts.map(toCellData),
        fields: "userEnteredValue",
      },
    });
  }

  if (requests.length > 0) {
    // A single spreadsheets.batchUpdate is atomic: Google validates every
    // request before applying any update or append in the batch.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // Invalidate edge cache so subsequent reads see the updated database immediately.
  globalCache.cachedAt = 0;

  return {
    updatedCount: updates.length,
    insertedCount: inserts.length,
    totalCount: updates.length + inserts.length,
  };
}

/**
 * Backward-compatible wrapper for appendMarksLog.
 */
export async function appendMarksLog(records) {
  const res = await saveOrUpdateMarksLog(records);
  return res.totalCount;
}

/**
 * Appends a question paper submission.
 */
export async function appendQuestionPaper(paperData) {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();

  // Ensure Question_Papers_Log sheet tab exists
  try {
    const metaRes = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    const tabs = (metaRes.data.sheets || []).map((s) => s.properties.title);
    if (!tabs.includes("Question_Papers_Log")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: "Question_Papers_Log",
                },
              },
            },
          ],
        },
      });

      // Add headers
      const headers = [
        "Submission_ID",
        "Submitted_At",
        "Teacher_Name",
        "Grade",
        "Subject",
        "Exam_ID",
        "Submission_Type",
        "File_URL",
        "Text_Content",
        "Status",
        "Admin_Feedback",
        "Submitted_By_Teacher_ID",
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Question_Papers_Log'!A1:L1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });
    }

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Question_Papers_Log'!A1:ZZ1",
    });
    const headers = (headerResponse.data.values?.[0] || []).map((header) =>
      String(header || "").trim()
    );
    if (!headers.includes("Submitted_By_Teacher_ID")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Question_Papers_Log'!L1",
        valueInputOption: "RAW",
        requestBody: { values: [["Submitted_By_Teacher_ID"]] },
      });
    }
  } catch (err) {
    console.error("Could not ensure Question_Papers_Log ownership schema:", err);
    throw err;
  }

  const escapeFormula = (val) => {
    const s = String(val !== undefined && val !== null ? val : "");
    if (s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@")) {
      return `'${s}`;
    }
    return s;
  };

  const row = [
    escapeFormula(paperData.Submission_ID || `QP-${Date.now().toString(36).toUpperCase()}`),
    escapeFormula(paperData.Submitted_At || new Date().toISOString()),
    escapeFormula(paperData.Teacher_Name || ""),
    escapeFormula(String(paperData.Grade || "")),
    escapeFormula(paperData.Subject || ""),
    escapeFormula(paperData.Exam_ID || ""),
    escapeFormula(paperData.Submission_Type || "Direct Text"),
    escapeFormula(paperData.File_URL || ""),
    escapeFormula(paperData.Text_Content || ""),
    escapeFormula(paperData.Status || "Pending"),
    escapeFormula(paperData.Admin_Feedback || ""),
    escapeFormula(paperData.Submitted_By_Teacher_ID || ""),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Question_Papers_Log'!A:L",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });

  globalCache.cachedAt = 0;
  return true;
}

/**
 * Updates question paper status and admin feedback by Submission_ID.
 */
export async function updateQuestionPaperStatus(submissionId, newStatus, adminFeedback = "") {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Question_Papers_Log'!A1:L1000",
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return false;

  const headers = rows[0].map((h) => String(h || "").trim());
  const idColIdx = headers.indexOf("Submission_ID");
  const statusColIdx = headers.indexOf("Status");
  const feedbackColIdx = headers.indexOf("Admin_Feedback");

  if (idColIdx === -1) return false;

  let targetRowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idColIdx] || "").trim() === String(submissionId).trim()) {
      targetRowIdx = i + 1; // 1-indexed row number
      break;
    }
  }

  if (targetRowIdx === -1) return false;

  const statusColLetter = String.fromCharCode(65 + (statusColIdx !== -1 ? statusColIdx : 9));
  const feedbackColLetter = String.fromCharCode(65 + (feedbackColIdx !== -1 ? feedbackColIdx : 10));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'Question_Papers_Log'!${statusColLetter}${targetRowIdx}`,
          values: [[newStatus]],
        },
        {
          range: `'Question_Papers_Log'!${feedbackColLetter}${targetRowIdx}`,
          values: [[adminFeedback]],
        },
      ],
    },
  });

  globalCache.cachedAt = 0;
  return true;
}

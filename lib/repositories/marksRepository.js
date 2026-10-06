import "server-only";
import { getWriteContext } from "./googleSheetsClient.js";
import { requireHeaders, normalizeWriteKey } from "./sheetRows.mjs";
import { invalidateAcademicCache } from "./academicRepository.js";

const MARKS_HEADERS = [
  "Submission_ID",
  "Kit_No",
  "Exam_ID",
  "Subject",
  "Marks_Obtained",
];
/**
 * Saves or updates student marks in the Marks_Log sheet.
 * Matches existing records by Submission_ID or composite key (Kit_No + Exam_ID + Subject).
 * Updates matching rows in-place using batchUpdate to preserve previous Submission_IDs,
 * and appends only genuinely new student records to prevent duplicate marks.
 */
export async function saveOrUpdateMarksLog(records, options = {}) {
  if (!records || records.length === 0) {
    return { updatedCount: 0, insertedCount: 0, totalCount: 0 };
  }

  const { sheets, spreadsheetId } = await getWriteContext(options);

  // 1. Fetch current rows from Marks_Log to locate row numbers and Submission_IDs
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Marks_Log'!A:E",
  });
  const currentValues = currentResponse.data.values || [];
  requireHeaders(currentValues, MARKS_HEADERS, "Marks_Log");

  // Row 1 is header: [Submission_ID, Kit_No, Exam_ID, Subject, Marks_Obtained].
  const subIdToRow = new Map();
  const compositeToRow = new Map();
  const ambiguousSubIds = new Set();
  const ambiguousComposites = new Set();
  const normalizeKey = normalizeWriteKey;

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
  invalidateAcademicCache();

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

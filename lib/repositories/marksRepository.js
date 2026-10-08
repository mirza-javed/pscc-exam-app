import "server-only";
import { getWriteContext } from "./googleSheetsClient.js";
import { requireHeaders, normalizeWriteKey } from "./sheetRows.mjs";
import { invalidateAcademicCache } from "./academicRepository.js";
import { marksExpectedState } from "../writeState.mjs";
import { assertExpectedState } from "../services/writeCoordinationService.mjs";

import { auditMark } from "../domain/auditEvents.mjs";

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

  if (!options.operation && !options.sheets)
    throw new Error("Marks writes require coordination.");
  const { sheets, spreadsheetId } =
    options.operation?.storage || (await getWriteContext(options));

  // 1. Fetch current rows from Marks_Log to locate row numbers and Submission_IDs
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Marks_Log'",
  });
  const currentValues = currentResponse.data.values || [];
  const { headers, columns } = requireHeaders(
    currentValues,
    MARKS_HEADERS,
    "Marks_Log",
  );
  if (options.operation) {
    const db = {
      Marks_Log: currentValues
        .slice(1)
        .map((row) =>
          Object.fromEntries(
            headers.map((header, i) => [header, row[i] ?? ""]),
          ),
        ),
    };
    const body = {
      records,
      examId: records[0].Exam_ID,
      subject: records[0].Subject,
    };
    assertExpectedState(options.expectedState, marksExpectedState(db, body));
  }

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
    const rowSubId = String(row[columns.get("Submission_ID")] || "").trim();
    const rowKitNo = String(row[columns.get("Kit_No")] || "").trim();
    const rowExamId = String(row[columns.get("Exam_ID")] || "")
      .trim()
      .toLowerCase();
    const rowSubject = String(row[columns.get("Subject")] || "")
      .trim()
      .toLowerCase();
    const rowCompositeKey =
      rowKitNo && rowExamId && rowSubject
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
      if (compositeToRow.has(rowCompositeKey))
        ambiguousComposites.add(rowCompositeKey);
      else {
        compositeToRow.set(rowCompositeKey, {
          rowNumber: sheetRowNumber,
          subId: rowSubId,
        });
      }
    }
  }

  const updates = [];
  const inserts = [];
  const auditChanges = [];
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
    const marks = String(
      r.Marks_Obtained !== undefined ? r.Marks_Obtained : "",
    ).trim();

    const incomingSubKey = normalizeKey(incomingSubId);
    const compositeKey = `${normalizeKey(kitNo)}___${normalizeKey(examId)}___${normalizeKey(subject)}`;
    if (
      requestStudents.has(compositeKey) ||
      (incomingSubKey && requestSubmissionIds.has(incomingSubKey))
    ) {
      throw new Error("Duplicate marks record reached the storage boundary.");
    }
    if (
      ambiguousComposites.has(compositeKey) ||
      (incomingSubKey && ambiguousSubIds.has(incomingSubKey))
    ) {
      throw new Error("Ambiguous marks record reached the storage boundary.");
    }
    requestStudents.add(compositeKey);
    if (incomingSubKey) requestSubmissionIds.add(incomingSubKey);

    const existingBySubmissionId = incomingSubKey
      ? subIdToRow.get(incomingSubKey)
      : null;
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
    const change = (submissionId, before) => ({
      Action_Type: existing ? "MARKS_UPDATED" : "MARKS_CREATED",
      Resource_Type: "MARK",
      Resource_Key: JSON.stringify([
        normalizeKey(kitNo),
        normalizeKey(examId),
        normalizeKey(subject),
      ]),
      Exam_ID: examId,
      Subject: subject,
      Kit_No: kitNo,
      Submission_ID: submissionId,
      Grade: options.auditScope?.grade,
      Section: options.auditScope?.section,
      before,
      after: auditMark(marks),
      Outcome: "SUCCESS",
    });

    if (existing) {
      const targetSubId = existing.subId || incomingSubId || makeSubmissionId();
      if (options.operation) {
        const before = auditMark(
          currentValues[existing.rowNumber - 1][columns.get("Marks_Obtained")],
        );
        if (before !== auditMark(marks))
          auditChanges.push(change(targetSubId, before));
      }
      updates.push({
        rowNumber: existing.rowNumber,
        values: [targetSubId, kitNo, examId, subject, marks],
      });
    } else {
      const newSubId = incomingSubId || makeSubmissionId();
      if (options.operation) auditChanges.push(change(newSubId, null));
      inserts.push([newSubId, kitNo, examId, subject, marks]);
    }
  }

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const marksSheet = (meta.data.sheets || []).find(
    (sheet) => sheet.properties?.title === "Marks_Log",
  );
  if (!marksSheet) throw new Error("Marks_Log sheet is unavailable.");

  const sheetId = marksSheet.properties.sheetId;
  const cell = (header, value) => ({
    userEnteredValue:
      header === "Marks_Obtained" && value !== "Absent"
        ? { numberValue: Number(value) }
        : { stringValue: String(value) },
  });
  // Group only adjacent owned columns, so extra/formula columns are never cleared.
  const owned = MARKS_HEADERS.map((header, index) => ({
    header,
    index,
    column: columns.get(header),
  })).sort((a, b) => a.column - b.column);
  const groups = [];
  for (const entry of owned) {
    const group = groups.at(-1);
    if (group && group.at(-1).column + 1 === entry.column) group.push(entry);
    else groups.push([entry]);
  }
  const requests = updates.flatMap((update) =>
    groups.map((group) => ({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: update.rowNumber - 1,
          endRowIndex: update.rowNumber,
          startColumnIndex: group[0].column,
          endColumnIndex: group.at(-1).column + 1,
        },
        rows: [
          {
            values: group.map((entry) =>
              cell(entry.header, update.values[entry.index]),
            ),
          },
        ],
        fields: "userEnteredValue",
      },
    })),
  );
  if (inserts.length > 0) {
    requests.push({
      appendCells: {
        sheetId,
        rows: inserts.map((values) => ({
          values: headers.map((header) => {
            const index = MARKS_HEADERS.indexOf(header);
            return index < 0 ? {} : cell(header, values[index]);
          }),
        })),
        fields: "userEnteredValue",
      },
    });
  }

  const result = {
    updatedCount: updates.length,
    insertedCount: inserts.length,
    totalCount: updates.length + inserts.length,
  };
  if (options.operation)
    return options.operation.commit(
      requests,
      options.receiptFromResult(result),
      auditChanges.length
        ? auditChanges
        : [
            {
              Action_Type: "MARKS_SAVED_UNCHANGED",
              Resource_Type: "SAVE",
              Resource_Key: JSON.stringify([
                "marks",
                records[0].Exam_ID,
                records[0].Subject,
              ]),
              Outcome: "SUCCESS",
            },
          ],
    );
  if (requests.length > 0) {
    // A single spreadsheets.batchUpdate is atomic: Google validates every
    // request before applying any update or append in the batch.
    await sheets.spreadsheets.batchUpdate(
      {
        spreadsheetId,
        requestBody: { requests },
      },
      { retry: false, retryConfig: { retry: 0 } },
    );
  }

  // Invalidate edge cache so subsequent reads see the updated database immediately.
  invalidateAcademicCache();

  return result;
}

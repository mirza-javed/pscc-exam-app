import assert from "node:assert/strict";
import test from "node:test";
import { saveOrUpdateMarksLog } from "../lib/googleSheets.js";

const marksHeaders = ["Submission_ID", "Kit_No", "Exam_ID", "Subject", "Marks_Obtained"];
function fakeSheets(values, options = {}) {
  const calls = { get: 0, spreadsheetBatchUpdate: [] };
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "Marks_Log", sheetId: 7 } }] } }),
      batchUpdate: async (request) => {
        calls.spreadsheetBatchUpdate.push(request);
        return { data: {} };
      },
      values: {
        get: async () => {
          calls.get += 1;
          if (options.getError) throw options.getError;
          return { data: { values } };
        },
      },
    },
  };
  return { sheets, calls, spreadsheetId: "sheet-1" };
}

test("failed and malformed marks prerequisite reads produce zero writes", async () => {
  for (const fixture of [
    fakeSheets([], { getError: new Error("upstream unavailable") }),
    fakeSheets([["Wrong", "Headers"]]),
  ]) {
    await assert.rejects(
      saveOrUpdateMarksLog([
        { Kit_No: "100", Exam_ID: "EXAM-1", Subject: "Physics", Marks_Obtained: "20" },
      ], fixture),
      (error) => error instanceof Error
    );
    assert.equal(fixture.calls.spreadsheetBatchUpdate.length, 0);
  }
});

test("marks update and append planning remains one atomic spreadsheet batch", async () => {
  const fixture = fakeSheets([marksHeaders]);
  const result = await saveOrUpdateMarksLog([
    { Kit_No: "100", Exam_ID: "EXAM-1", Subject: "Physics", Marks_Obtained: "20" },
  ], fixture);
  assert.deepEqual(result, { updatedCount: 0, insertedCount: 1, totalCount: 1 });
  assert.equal(fixture.calls.spreadsheetBatchUpdate.length, 1);
  assert.equal(fixture.calls.spreadsheetBatchUpdate[0].requestBody.requests.length, 1);
});

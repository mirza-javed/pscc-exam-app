import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQuestionPaper,
  saveOrUpdateMarksLog,
  SheetWriteError,
  updateQuestionPaperStatus,
} from "../lib/googleSheets.js";

const marksHeaders = ["Submission_ID", "Kit_No", "Exam_ID", "Subject", "Marks_Obtained"];
const paperHeaders = [
  "Submission_ID", "Submitted_At", "Teacher_Name", "Grade", "Subject", "Exam_ID",
  "Submission_Type", "File_URL", "Text_Content", "Status", "Admin_Feedback",
  "Submitted_By_Teacher_ID",
];

function paper(overrides = {}) {
  return {
    Submission_ID: "QP-12345678-1234-1234-1234-123456789abc",
    Submitted_At: "2026-09-16 10:00",
    Teacher_Name: "Teacher One",
    Grade: "9",
    Subject: "Physics",
    Exam_ID: "EXAM-1",
    Submission_Type: "Direct Text",
    File_URL: "",
    Text_Content: "=This must remain literal text",
    Status: "Pending",
    Admin_Feedback: "",
    Submitted_By_Teacher_ID: "T-1",
    ...overrides,
  };
}

function fakeSheets(values, options = {}) {
  const calls = { get: 0, append: [], valuesBatchUpdate: [], spreadsheetBatchUpdate: [] };
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
        append: async (request) => {
          calls.append.push(request);
          return { data: {} };
        },
        batchUpdate: async (request) => {
          calls.valuesBatchUpdate.push(request);
          return { data: {} };
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

test("paper append fails closed on read and schema errors", async () => {
  for (const fixture of [
    fakeSheets([], { getError: new Error("upstream unavailable") }),
    fakeSheets([["Wrong", "Headers"]]),
  ]) {
    await assert.rejects(appendQuestionPaper(paper(), fixture));
    assert.equal(fixture.calls.append.length, 0);
  }
});

test("paper text is appended literally with RAW input", async () => {
  const fixture = fakeSheets([paperHeaders]);
  const result = await appendQuestionPaper(paper(), fixture);
  assert.deepEqual(result, { inserted: true, idempotent: false });
  assert.equal(fixture.calls.append.length, 1);
  assert.equal(fixture.calls.append[0].valueInputOption, "RAW");
  assert.equal(fixture.calls.append[0].requestBody.values[0][8], "=This must remain literal text");
});

test("exact paper retries are idempotent and conflicting reuse is rejected", async () => {
  const stored = paperHeaders.map((header) => paper()[header]);
  const replayFixture = fakeSheets([paperHeaders, stored]);
  assert.deepEqual(await appendQuestionPaper(paper({ Submitted_At: "later" }), replayFixture), {
    inserted: false,
    idempotent: true,
  });
  assert.equal(replayFixture.calls.append.length, 0);

  const conflictFixture = fakeSheets([paperHeaders, stored]);
  await assert.rejects(
    appendQuestionPaper(paper({ Subject: "Chemistry" }), conflictFixture),
    (error) => error instanceof SheetWriteError && error.code === "SUBMISSION_ID_CONFLICT"
  );
  assert.equal(conflictFixture.calls.append.length, 0);
});

test("review updates work beyond row 1000 and store formula-like feedback literally", async () => {
  const unrelated = Array.from({ length: 1000 }, (_, index) => paperHeaders.map((header) =>
    paper({ Submission_ID: `QP-OTHER-${index}` })[header]
  ));
  const target = paper();
  const fixture = fakeSheets([paperHeaders, ...unrelated, paperHeaders.map((header) => target[header])]);
  const result = await updateQuestionPaperStatus(
    target.Submission_ID,
    "Revision Needed",
    "=Literal feedback",
    target,
    fixture
  );
  assert.deepEqual(result, { updated: true, idempotent: false, found: true });
  assert.equal(fixture.calls.valuesBatchUpdate.length, 1);
  const request = fixture.calls.valuesBatchUpdate[0].requestBody;
  assert.equal(request.valueInputOption, "RAW");
  assert.equal(request.data[0].range, "'Question_Papers_Log'!J1002");
  assert.equal(request.data[1].values[0][0], "=Literal feedback");
});

test("changed review prerequisites produce zero writes", async () => {
  const target = paper();
  const changed = paper({ Status: "Approved" });
  const fixture = fakeSheets([paperHeaders, paperHeaders.map((header) => changed[header])]);
  await assert.rejects(
    updateQuestionPaperStatus(target.Submission_ID, "Revision Needed", "", target, fixture),
    (error) => error instanceof SheetWriteError && error.code === "PAPER_CHANGED"
  );
  assert.equal(fixture.calls.valuesBatchUpdate.length, 0);
});

test("storage rejects unsupported review statuses without writing", async () => {
  const target = paper();
  const fixture = fakeSheets([paperHeaders, paperHeaders.map((header) => target[header])]);
  await assert.rejects(
    updateQuestionPaperStatus(target.Submission_ID, "Deleted", "", target, fixture),
    (error) => error instanceof SheetWriteError && error.code === "INVALID_STATUS_TRANSITION"
  );
  assert.equal(fixture.calls.get, 0);
  assert.equal(fixture.calls.valuesBatchUpdate.length, 0);
});

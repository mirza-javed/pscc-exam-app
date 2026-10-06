import { mockServerModule } from "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
const calls = { batches: 0, contexts: 0 };
const marksHeaders = ["Submission_ID", "Kit_No", "Exam_ID", "Subject", "Marks_Obtained"];
const sheets = { spreadsheets: {
  get: async () => ({ data: { sheets: [{ properties: { title: "Students" } }, { properties: { title: "Marks_Log", sheetId: 1 } }] } }),
  batchUpdate: async () => ({}),
  values: {
    batchGet: async ({ ranges }) => { calls.batches++; return { data: { valueRanges: ranges.map((range) => ({ values: range.includes("Students") ? [["Kit_No", "Full_Name", "Group"], ["100", "Synthetic", "Science"]] : [] })) } }; },
    get: async ({ range }) => ({ data: { values: range.includes("Marks_Log") ? [marksHeaders] : [["Email", "Active"], ["approved@example.test", "TRUE"]] } }),
  },
} };
mockServerModule("lib/repositories/googleSheetsClient.js", {
  getGoogleAuth: () => { calls.contexts++; return { sheets }; },
  getSpreadsheetId: async () => "synthetic-workbook",
  getWriteContext: async () => ({ sheets, spreadsheetId: "synthetic-workbook" }),
});
const repo = await import("../lib/repositories/academicRepository.js");
const { saveOrUpdateMarksLog } = await import("../lib/repositories/marksRepository.js");

test("academic repository retains row aliases, optional tabs, cache hits and explicit refresh", async () => {
  const first = await repo.loadMasterDatabase();
  assert.equal(first._cached, false);
  assert.equal(first.Students[0].Student_ID, "100");
  assert.equal(first.Students[0].Name, "Synthetic");
  assert.equal(first.Students[0].Stream, "Science");
  assert.deepEqual(first.Result_Publications, []);
  const cached = await repo.loadMasterDatabase();
  assert.equal(cached._cached, true);
  assert.equal(cached._cachedAt, first._cachedAt);
  assert.equal(calls.batches, 1);
  assert.equal((await repo.loadMasterDatabase(true))._cached, false);
  assert.equal(calls.batches, 2);
});

test("approval and protected reads bypass the master cache and filter tab names", async () => {
  const before = calls.batches;
  await repo.loadAuthorizationData();
  await repo.loadAuthorizationData();
  assert.equal(calls.batches, before + 2);
  const fresh = await repo.loadFreshDatabaseTabs(["Students", "Students", "unknown"]);
  assert.deepEqual(Object.keys(fresh), ["Students"]);
  const after = calls.batches;
  assert.deepEqual(await repo.loadFreshDatabaseTabs(["unknown"]), {});
  assert.equal(calls.batches, after);
  assert.equal((await repo.loadStaffDirectory())[0].Active, "TRUE");
});

test("successful marks persistence invalidates the same academic cache", async () => {
  assert.equal((await repo.loadMasterDatabase())._cached, true);
  await saveOrUpdateMarksLog([{ Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: "80" }]);
  assert.equal((await repo.loadMasterDatabase())._cached, false);
});

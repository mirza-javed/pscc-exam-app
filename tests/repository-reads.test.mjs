import { mockServerModule } from "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const snapshot = JSON.parse(
  readFileSync(
    new URL("./fixtures/data-validation.json", import.meta.url),
    "utf8",
  ),
).tabs;
snapshot.Students = [
  ["Kit_No", "Full_Name", "Group", "Grade", "Section"],
  ["100", "Synthetic", "Science", "9", "A"],
];
delete snapshot.Result_Publications;
const calls = { batches: 0, contexts: 0 };
const marksHeaders = [
  "Submission_ID",
  "Kit_No",
  "Exam_ID",
  "Subject",
  "Marks_Obtained",
];
const sheets = {
  spreadsheets: {
    get: async () => ({
      data: {
        sheets: Object.keys(snapshot).map((title) => ({
          properties: { title, sheetId: 1 },
        })),
      },
    }),
    batchUpdate: async () => ({}),
    values: {
      batchGet: async ({ ranges }) => {
        calls.batches++;
        return {
          data: {
            valueRanges: ranges.map((range) => ({
              values: snapshot[range.slice(1, -1)],
            })),
          },
        };
      },
      get: async ({ range }) => ({
        data: {
          values: range.includes("Marks_Log")
            ? [marksHeaders]
            : snapshot.Staff_Directory,
        },
      }),
    },
  },
};
mockServerModule("lib/repositories/googleSheetsClient.js", {
  getGoogleAuth: () => {
    calls.contexts++;
    return { sheets };
  },
  getSpreadsheetId: async () => "synthetic-workbook",
  getWriteContext: async () => ({
    sheets,
    spreadsheetId: "synthetic-workbook",
  }),
});
const repo = await import("../lib/repositories/academicRepository.js");
const { parseTabRows } = await import("../lib/repositories/sheetRows.mjs");
const { saveOrUpdateMarksLog } = await import(
  "../lib/repositories/marksRepository.js"
);

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
  const fresh = await repo.loadFreshDatabaseTabs([
    "Students",
    "Students",
    "unknown",
  ]);
  assert.deepEqual(Object.keys(fresh), ["Students"]);
  const after = calls.batches;
  assert.deepEqual(await repo.loadFreshDatabaseTabs(["unknown"]), {});
  assert.equal(calls.batches, after);
  assert.equal((await repo.loadStaffDirectory())[0].Active, "TRUE");
});

test("successful marks persistence invalidates the same academic cache", async () => {
  assert.equal((await repo.loadMasterDatabase())._cached, true);
  await saveOrUpdateMarksLog([
    { Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: "80" },
  ], { sheets, spreadsheetId: "synthetic-workbook" });
  assert.equal((await repo.loadMasterDatabase())._cached, false);
});

test("runtime distinguishes missing required tabs, absent optional tabs and malformed reads", async () => {
  assert.deepEqual(await repo.loadFreshDatabaseTabs(["Result_Publications"]), {
    Result_Publications: [],
  });
  const students = snapshot.Students;
  delete snapshot.Students;
  try {
    await assert.rejects(
      repo.loadMasterDatabase(true),
      /Students: MISSING_SHEET/,
    );
    await assert.rejects(
      repo.loadFreshDatabaseTabs(["Students"]),
      /Students: MISSING_SHEET/,
    );
  } finally {
    snapshot.Students = students;
  }
  snapshot.Students = [];
  try {
    await assert.rejects(
      repo.loadFreshDatabaseTabs(["Students"]),
      /MISSING_HEADERS/,
    );
  } finally {
    snapshot.Students = students;
  }
});

test("exam reads ignore explanatory cells beyond header table and exclude auxiliary-only rows", async () => {
  const original = snapshot.exam_scheme;
  const headers = [
    "Exam_ID",
    "Exam_Name",
    "Academic_Session",
    "Grade",
    "Subject",
    "Max_Marks",
    "Exam_Order",
  ];
  const record = ["E1", "Synthetic", "2026-27", "9", "English", "100", "1"];
  const rows = [
    headers,
    [...record, "", "", "Explanation", "Helper", "Note"],
    ["", "", "", "", "", "", "", "", "", "Explanation"],
  ];
  snapshot.exam_scheme = rows;
  try {
    const fresh = await repo.loadFreshDatabaseTabs(["exam_scheme"]);
    assert.deepEqual(fresh.exam_scheme, [
      Object.fromEntries(headers.map((h, i) => [h, record[i]])),
    ]);
    const reordered = rows.map((row) => [
      ...row.slice(0, 7).toReversed(),
      ...row.slice(7),
    ]);
    assert.deepEqual(parseTabRows(reordered, "exam_scheme"), fresh.exam_scheme);
    const malformed = rows.map((row) => ["", ...row]);
    malformed[1][0] = "Unknown inside table";
    assert.throws(
      () => parseTabRows(malformed, "exam_scheme"),
      /UNNAMED_POPULATED_COLUMN/,
    );
  } finally {
    snapshot.exam_scheme = original;
  }
});

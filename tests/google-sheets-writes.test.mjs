import "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
const { saveOrUpdateMarksLog } = await import("../lib/googleSheets.js");

const marksHeaders = [
  "Submission_ID",
  "Kit_No",
  "Exam_ID",
  "Subject",
  "Marks_Obtained",
];
function fakeSheets(values, options = {}) {
  const calls = { get: 0, spreadsheetBatchUpdate: [] };
  const sheets = {
    spreadsheets: {
      get: async () => ({
        data: { sheets: [{ properties: { title: "Marks_Log", sheetId: 7 } }] },
      }),
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
      saveOrUpdateMarksLog(
        [
          {
            Kit_No: "100",
            Exam_ID: "EXAM-1",
            Subject: "Physics",
            Marks_Obtained: "20",
          },
        ],
        fixture,
      ),
      (error) => error instanceof Error,
    );
    assert.equal(fixture.calls.spreadsheetBatchUpdate.length, 0);
  }
});

test("marks update and append planning remains one atomic spreadsheet batch", async () => {
  const fixture = fakeSheets([marksHeaders]);
  const result = await saveOrUpdateMarksLog(
    [
      {
        Kit_No: "100",
        Exam_ID: "EXAM-1",
        Subject: "Physics",
        Marks_Obtained: "20",
      },
    ],
    fixture,
  );
  assert.deepEqual(result, {
    updatedCount: 0,
    insertedCount: 1,
    totalCount: 1,
  });
  assert.equal(fixture.calls.spreadsheetBatchUpdate.length, 1);
  assert.equal(
    fixture.calls.spreadsheetBatchUpdate[0].requestBody.requests.length,
    1,
  );
});

test("mixed update and append keeps IDs and uses safe string and numeric cells", async () => {
  const target = fakeSheets([
    marksHeaders,
    ["S1", "100", "E1", "English", "80"],
  ]);
  const result = await saveOrUpdateMarksLog(
    [
      {
        Kit_No: "100",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "90",
      },
      {
        Kit_No: "=synthetic",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "Absent",
      },
    ],
    target,
  );
  assert.deepEqual(result, {
    updatedCount: 1,
    insertedCount: 1,
    totalCount: 2,
  });
  assert.equal(target.calls.spreadsheetBatchUpdate.length, 1);
  const requests = target.calls.spreadsheetBatchUpdate[0].requestBody.requests;
  assert.equal(
    requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue,
    "S1",
  );
  assert.equal(
    requests[0].updateCells.rows[0].values[4].userEnteredValue.numberValue,
    90,
  );
  assert.deepEqual(requests[1].appendCells.rows[0].values[1].userEnteredValue, {
    stringValue: "=synthetic",
  });
  assert.deepEqual(requests[1].appendCells.rows[0].values[4].userEnteredValue, {
    stringValue: "Absent",
  });
});

test("duplicate records, changed ownership and failed metadata stop storage writes", async () => {
  const record = {
    Submission_ID: "S1",
    Kit_No: "100",
    Exam_ID: "E1",
    Subject: "English",
    Marks_Obtained: "90",
  };
  for (const records of [
    [record, record],
    [{ ...record, Kit_No: "200" }],
    [{ ...record, Submission_ID: "UNKNOWN" }],
  ]) {
    const target = fakeSheets([
      marksHeaders,
      ["S1", "100", "E1", "English", "80"],
    ]);
    await assert.rejects(saveOrUpdateMarksLog(records, target));
    assert.equal(target.calls.spreadsheetBatchUpdate.length, 0);
  }
  const target = fakeSheets([
    marksHeaders,
    ["S1", "100", "E1", "English", "80"],
  ]);
  target.sheets.spreadsheets.get = async () => {
    throw new Error("synthetic metadata failure");
  };
  await assert.rejects(
    saveOrUpdateMarksLog([record], target),
    /metadata failure/,
  );
  assert.equal(target.calls.spreadsheetBatchUpdate.length, 0);
});

test("marks writer handles reordered columns, extra fields and targets beyond row 1000", async () => {
  const headers = [
    "Notes",
    "Subject",
    "Marks_Obtained",
    "Kit_No",
    "Formula",
    "Submission_ID",
    "Exam_ID",
  ];
  const values = [
    headers,
    ...Array.from({ length: 1100 }, () => []),
    ["Preserve", "English", "80", "100", "=1+1", "S1", "E1"],
  ];
  const target = fakeSheets(values);
  const result = await saveOrUpdateMarksLog(
    [
      {
        Kit_No: "100",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "90",
      },
    ],
    target,
  );
  assert.equal(result.updatedCount, 1);
  const requests = target.calls.spreadsheetBatchUpdate[0].requestBody.requests;
  const cells = new Map();
  for (const { updateCells: update } of requests) {
    assert.equal(update.range.startRowIndex, 1101);
    update.rows[0].values.forEach((cell, i) =>
      cells.set(update.range.startColumnIndex + i, cell.userEnteredValue),
    );
  }
  assert.equal(cells.has(0), false);
  assert.equal(cells.has(4), false);
  assert.deepEqual(cells.get(2), { numberValue: 90 });
  assert.deepEqual(cells.get(5), { stringValue: "S1" });
  const append = fakeSheets([headers]);
  await saveOrUpdateMarksLog(
    [
      {
        Kit_No: "100",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "Absent",
      },
    ],
    append,
  );
  const row =
    append.calls.spreadsheetBatchUpdate[0].requestBody.requests[0].appendCells
      .rows[0].values;
  assert.deepEqual(row[0], {});
  assert.deepEqual(row[4], {});
  assert.deepEqual(row[2].userEnteredValue, { stringValue: "Absent" });
});

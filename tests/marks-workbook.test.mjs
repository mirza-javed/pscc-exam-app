import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { readMarksWorkbook } from "../lib/client/marksWorkbook.mjs";

function binary(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "Synthetic",
  );
  return XLSX.write(workbook, { type: "binary", bookType: "xlsx" });
}

test("workbook header aliases preserve raw zero/absence and duplicate-row overwrite behavior", () => {
  const input = binary([
    { "Student ID": "001", "Marks Obtained": 0 },
    { "Student ID": "002", "Marks Obtained": "AB" },
    { "Student ID": "003", "Marks Obtained": 42 },
    { "Student ID": "001", "Marks Obtained": "5.5" },
    { "Student ID": "004", "Marks Obtained": "" },
  ]);
  const previous = { existing: "19" };
  const result = readMarksWorkbook(input, previous, (id) => id === "003");
  assert.deepEqual(result, {
    newMarks: { "001": "5.5", "002": "AB", existing: "19" },
    mappedCount: 3,
  });
  assert.deepEqual(previous, { existing: "19" });
});

test("workbook empty data and missing required columns retain existing errors", () => {
  assert.throws(
    () => readMarksWorkbook(binary([]), {}, () => false),
    /Uploaded sheet contains no data/,
  );
  assert.throws(
    () =>
      readMarksWorkbook(
        binary([{ Name: "Synthetic", Value: 4 }]),
        {},
        () => false,
      ),
    /Could not find Student ID column/,
  );
  assert.equal(
    readMarksWorkbook(
      binary([{ Kit_No: "001", Marks_Obtained: 0 }]),
      {},
      () => false,
    ).newMarks["001"],
    "0",
  );
});

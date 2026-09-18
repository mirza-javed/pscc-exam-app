import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCombinedResultWorkbook,
  buildIndividualResultWorkbook,
} from "../lib/excelResultGenerator.mjs";
import { ALL_EXAMS, resolveClassResults } from "../lib/examinationResults.mjs";

function scheme(examId, examName, examOrder, subject, maximum) {
  return {
    Exam_ID: examId,
    Exam_Name: examName,
    Academic_Session: "2026-27",
    Exam_Order: examOrder,
    Grade: "9",
    Subject: subject,
    Max_Marks: maximum,
  };
}

function mark(kitNo, examId, subject, obtained) {
  return { Kit_No: kitNo, Exam_ID: examId, Subject: subject, Marks_Obtained: obtained };
}

function resolvedData() {
  const db = {
    Students: [
      { Kit_No: "100", Name: "Cadet One", Grade: "9", Section: "A", Group: "Bio" },
      { Kit_No: "101", Name: "Cadet Two", Grade: "9", Section: "A", Group: "Bio" },
    ],
    exam_scheme: [
      scheme("E2", "Term Exam", 2, "English", 100),
      scheme("E1", "Monthly Test", 1, "English", 50),
      scheme("E1", "Monthly Test", 1, "Physics", 50),
    ],
    Marks_Log: [
      mark("100", "E1", "English", 40), mark("100", "E1", "Physics", 45), mark("100", "E2", "English", 80),
      mark("101", "E1", "English", 30), mark("101", "E1", "Physics", 35), mark("101", "E2", "English", 70),
    ],
    Grading_System: [],
  };
  return resolveClassResults(db, "9", "A", ALL_EXAMS, "2026-27");
}

function rowValues(worksheet, rowNumber, lastColumn) {
  const row = worksheet.getRow(rowNumber);
  return Array.from({ length: lastColumn }, (_, index) => row.getCell(index + 1).value ?? "");
}

async function assertSerializes(workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 1000);
}

test("individual All Exams workbook uses dynamic exams and professional formatting", async () => {
  const resolved = resolvedData();
  const cadet = resolved.results.find((row) => row.Kit_No === "100");
  const workbook = await buildIndividualResultWorkbook({
    cadet,
    selectedExam: ALL_EXAMS,
    examColumns: resolved.examColumns,
    subjectColumns: resolved.subjectColumns,
  });
  const worksheet = workbook.getWorksheet("Result_Card");

  assert.deepEqual(rowValues(worksheet, 5, 6), [
    "Subject", "Monthly Test", "Term Exam", "Grand Total", "Overall %", "Overall Grade",
  ]);
  assert.deepEqual(rowValues(worksheet, 6, 6), ["English", "40/50", "80/100", "120/150", "", ""]);
  assert.deepEqual(rowValues(worksheet, 7, 6), ["Physics", "45/50", "N/A", "45/50", "", ""]);
  assert.deepEqual(rowValues(worksheet, 8, 6), [
    "Grand Total / Aggregate", "85/100", "80/100", "165/200", 0.825, "B++",
  ]);

  assert.equal(worksheet.getCell("A1").font.bold, true);
  assert.equal(worksheet.getCell("A5").font.bold, true);
  assert.equal(worksheet.getCell("A5").alignment.horizontal, "center");
  assert.equal(worksheet.getCell("A6").alignment.horizontal, "left");
  assert.equal(worksheet.getCell("B6").alignment.horizontal, "center");
  assert.equal(worksheet.getCell("B6").border.top.style, "thin");
  assert.equal(worksheet.getCell("A8").font.bold, true);
  assert.equal(worksheet.getCell("E8").numFmt, "0.0%");
  assert.ok(worksheet.getColumn(1).width >= 20);
  assert.ok(worksheet.getColumn(2).width >= 17);
  assert.equal(worksheet.pageSetup.orientation, "landscape");
  await assertSerializes(workbook);
});

test("combined All Exams workbook uses dynamic subjects and separates grade from status", async () => {
  const resolved = resolvedData();
  const workbook = await buildCombinedResultWorkbook({
    meritGrid: resolved.results,
    selectedExam: ALL_EXAMS,
    subjectColumns: resolved.subjectColumns,
    grade: "9",
    section: "A",
    academicSession: "2026-27",
  });
  const worksheet = workbook.getWorksheet("Merit_Master_Sheet");

  assert.deepEqual(rowValues(worksheet, 5, 9), [
    "Rank", "Kit_No", "Name", "English", "Physics", "Grand Total", "Overall %", "Combined Grade", "Result Status",
  ]);
  assert.deepEqual(rowValues(worksheet, 6, 9).slice(3), [
    "120/150", "45/50", "165/200", 0.825, "B++", "PASS",
  ]);
  assert.equal(worksheet.getCell("C6").alignment.horizontal, "left");
  assert.equal(worksheet.getCell("D6").alignment.horizontal, "center");
  assert.equal(worksheet.getCell("D6").border.right.style, "thin");
  assert.equal(worksheet.getCell("G6").numFmt, "0.0%");
  assert.equal(worksheet.getCell("F6").font.bold, true);
  assert.equal(worksheet.getCell("I6").font.bold, true);
  assert.ok(worksheet.getColumn(3).width >= 28);
  assert.equal(worksheet.pageSetup.orientation, "landscape");
  assert.equal(worksheet.pageSetup.printTitlesRow, "5:5");
  await assertSerializes(workbook);
});

test("generated All Exams workbooks match both supplied sample calculation specifications", async () => {
  const sampleSubjects = [
    ["Biology", 9, 8],
    ["Chemistry", 8, 5],
    ["Computer Science", 25, 24],
    ["English", 25, 21],
    ["Islamiat", 25, 10],
    ["Maths", 25, 24],
    ["Physics", 8, 5],
    ["Sindhi", 25, 19],
    ["Social Studies", 25, 19],
    ["Urdu", 25, 20],
    ["Conduct", 5, 2],
  ];
  const sampleExams = [
    ["AUG", "Monthly Test Aug 26", 1],
    ["TERM", "1st Term Exam 2026", 2],
    ["NOV", "Monthly Test Nov 26", 3],
  ];
  const db = {
    Students: [{ Kit_No: "26002", Name: "Muhammad Anas Zaman Khan", Grade: "9", Section: "A", Group: "General" }],
    exam_scheme: sampleExams.flatMap(([examId, examName, examOrder]) =>
      sampleSubjects.map(([subject, maximum]) => scheme(examId, examName, examOrder, subject, maximum))
    ),
    Marks_Log: sampleExams.flatMap(([examId]) =>
      sampleSubjects.map(([subject, , obtained]) => mark("26002", examId, subject, obtained))
    ),
    Grading_System: [],
  };
  const resolved = resolveClassResults(db, "9", "A", ALL_EXAMS, "2026-27");
  const cadet = resolved.results[0];

  const individual = await buildIndividualResultWorkbook({
    cadet,
    selectedExam: ALL_EXAMS,
    examColumns: resolved.examColumns,
    subjectColumns: resolved.subjectColumns,
  });
  const individualSheet = individual.getWorksheet("Result_Card");
  assert.deepEqual(rowValues(individualSheet, 5, 7), [
    "Subject", "Monthly Test Aug 26", "1st Term Exam 2026", "Monthly Test Nov 26", "Grand Total", "Overall %", "Overall Grade",
  ]);
  assert.deepEqual(rowValues(individualSheet, 6, 7), ["Biology", "8/9", "8/9", "8/9", "24/27", "", ""]);
  assert.deepEqual(rowValues(individualSheet, 17, 7), [
    "Grand Total / Aggregate", "157/205", "157/205", "157/205", "471/615", 0.766, "B+",
  ]);

  const combined = await buildCombinedResultWorkbook({
    meritGrid: resolved.results,
    selectedExam: ALL_EXAMS,
    subjectColumns: resolved.subjectColumns,
  });
  const combinedSheet = combined.getWorksheet("Merit_Master_Sheet");
  assert.deepEqual(rowValues(combinedSheet, 5, 18), [
    "Rank", "Kit_No", "Name", "Biology", "Chemistry", "Computer Science", "English", "Islamiat", "Maths", "Physics", "Sindhi", "Social Studies", "Urdu", "Conduct", "Grand Total", "Overall %", "Combined Grade", "Result Status",
  ]);
  assert.deepEqual(rowValues(combinedSheet, 6, 18).slice(3), [
    "24/27", "15/24", "72/75", "63/75", "30/75", "72/75", "15/24", "57/75", "57/75", "60/75", "6/15", "471/615", 0.766, "B+", "PASS",
  ]);
  await Promise.all([assertSerializes(individual), assertSerializes(combined)]);
});

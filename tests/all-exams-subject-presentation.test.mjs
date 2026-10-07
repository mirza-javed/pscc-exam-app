import assert from "node:assert/strict";
import test from "node:test";
import TestRenderer from "react-test-renderer";
import { jsPDF } from "jspdf";
import { ALL_EXAMS, resolveClassResults } from "../lib/examinationResults.mjs";
import { buildIndividualAllExamsModel, buildResultRows, buildResultSummary } from "../lib/resultPresentation.mjs";
import { calculateGradeInfo } from "../lib/grading.js";
import { buildIndividualResultWorkbook } from "../lib/excelResultGenerator.mjs";
import { renderCadetResultCardToDoc } from "../lib/pdfGenerator.js";
import { loadClient, React } from "./helpers/uiHarness.mjs";

// Synthetic records reproduce the reference card's marks without student data.
const subjects = [
  ["Biology", 6, 9, 16, 17, "84.6%"],
  ["Chemistry", 7, 8, 15, 16, "91.7%"],
  ["Computer Science", 25, 25, 47, 50, "96.0%"],
  ["English", 24, 25, 49, 50, "97.3%"],
  ["Islamiat", 25, 25, 49, 50, "98.7%"],
  ["Maths", 24, 25, 49, 50, "97.3%"],
  ["Physics", 5, 8, 17, 17, "88.0%"],
  ["Sindhi", 22, 25, 40, 50, "82.7%"],
  ["Social Studies", 21, 25, 44, 50, "86.7%"],
  ["Urdu", 24, 25, 49, 50, "97.3%"],
  ["Conduct", 5, 5, 10, 10, "100.0%"],
];
function database() {
  return {
    Students: [{ Kit_No: "100", Name: "Synthetic Cadet", Grade: "8", Section: "A", Group: "General" }],
    exam_scheme: [1, 2].flatMap((order) => subjects.map(([Subject, , max1, , max2]) => ({
      Exam_ID: `E${order}`, Exam_Name: order === 1 ? "Monthly Test" : "1st Term Exam 2026",
      Exam_Order: order, Academic_Session: "2026-27", Grade: "8", Subject,
      Max_Marks: order === 1 ? max1 : max2,
    }))),
    Marks_Log: [1, 2].flatMap((order) => subjects.map(([Subject, obtained1, , obtained2]) => ({
      Kit_No: "100", Exam_ID: `E${order}`, Subject, Marks_Obtained: order === 1 ? obtained1 : obtained2,
    }))),
    Grading_System: [],
  };
}
function resolve(db, exam = ALL_EXAMS) {
  const resolved = resolveClassResults(db, "8", "A", exam, "2026-27");
  return { ...resolved, cadet: resolved.results[0] };
}
function model(data) {
  return buildIndividualAllExamsModel(data.cadet, data.examColumns, data.subjectColumns);
}
function pdf(data) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  renderCadetResultCardToDoc(doc, { ...data, grade: "8", section: "A", exam: ALL_EXAMS });
  return doc;
}

// Screen and browser print use the same table component and text nodes.
const { default: AllExamsResultCard } = await loadClient("components/Reports/AllExamsResultCard.jsx");
async function assertOutputs(data) {
  const presentation = model(data);
  const before = structuredClone(data.cadet);
  const screen = TestRenderer.create(React.createElement(AllExamsResultCard, { allExamsModel: presentation }));
  const screenRows = screen.root.findByType("tbody").findAllByType("tr");
  const doc = pdf(data);
  const pdfRows = doc.lastAutoTable.body;
  const workbook = await buildIndividualResultWorkbook({ ...data, selectedExam: ALL_EXAMS });
  const sheet = workbook.getWorksheet("Result_Card");
  const percentageColumn = data.examColumns.length + 3;
  presentation.rows.forEach((row, index) => {
    const texts = screenRows[index].findAllByType("td").map((cell) => cell.children.join(""));
    assert.deepEqual(texts.slice(-2), [row.overallPercentage, row.overallGrade]);
    assert.deepEqual(pdfRows[index].cells[percentageColumn - 1].text, [row.overallPercentage]);
    assert.deepEqual(pdfRows[index].cells[percentageColumn].text, [row.overallGrade]);
    const percentage = sheet.getRow(index + 6).getCell(percentageColumn);
    const expected = row.overallPercentage.endsWith("%")
      ? Number((Number(row.overallPercentage.slice(0, -1)) / 100).toFixed(6)) : row.overallPercentage;
    assert.equal(percentage.value, expected);
    if (typeof expected === "number") assert.equal(percentage.numFmt, "0.0%");
    assert.equal(sheet.getRow(index + 6).getCell(percentageColumn + 1).value, row.overallGrade);
  });
  screen.unmount();
  assert.deepEqual(data.cadet, before, "presentation and exports cannot mutate totals, status, rank, or fingerprint");
  return doc;
}

test("All Exams subject percentages and authoritative grades reach screen, PDF, Excel, and print", async () => {
  const data = resolve(database());
  const presentation = model(data);
  for (const [subject, obtained1, max1, obtained2, max2, percentage] of subjects) {
    const row = presentation.rows.find((item) => item.subject === subject);
    assert.equal(row.overallPercentage, percentage);
    assert.equal(row.overallGrade, calculateGradeInfo((obtained1 + obtained2) / (max1 + max2) * 100).grade);
  }
  assert.deepEqual(buildResultSummary(data.cadet), {
    total: "573 / 615", percentage: "93.2%", grade: "A+", rank: "#1", status: "PASS",
  });
  assert.equal(presentation.aggregateRow.grandTotal, "573/615");
  assert.equal(presentation.aggregateRow.overallPercentage, "93.2%");
  assert.equal(presentation.aggregateRow.overallGrade, "A+");
  const doc = await assertOutputs(data);
  assert.equal(doc.getNumberOfPages(), 1, "reference-sized card must keep aggregate and signatures on one page");
  assert.ok(doc.lastAutoTable.finalY + 17 < doc.internal.pageSize.getHeight() - 10);
});

test("All Exams grades use the configured scale and unrounded combined percentage", async () => {
  const db = database();
  db.Grading_System = [
    { Min_Percentage: 85, Max_Percentage: 100, Grade: "HIGH" },
    { Min_Percentage: 0, Max_Percentage: 84.99, Grade: "LOW" },
  ];
  db.exam_scheme.filter((r) => r.Subject === "English").forEach((r) => { r.Max_Marks = 100; });
  db.Marks_Log.filter((r) => r.Subject === "English").forEach((r) => { r.Marks_Obtained = 84.96; });
  const data = resolve(db);
  const row = model(data).rows.find((r) => r.subject === "English");
  assert.equal(row.overallPercentage, "85.0%");
  assert.equal(row.overallGrade, calculateGradeInfo(84.96, db.Grading_System).grade);
  assert.equal(row.overallGrade, "LOW");
  await assertOutputs(data);
});

test("All Exams preserves AB, missing, invalid, duplicate, configuration, and N/A policy in all outputs", async () => {
  for (const state of ["AB", "MISSING", "INVALID", "DUPLICATE", "CONFIGURATION", "N/A", "BAD_SCALE"]) {
    const db = database();
    const mark = db.Marks_Log.find((r) => r.Exam_ID === "E1" && r.Subject === "English");
    if (state === "AB") mark.Marks_Obtained = "AB";
    if (state === "MISSING") db.Marks_Log = db.Marks_Log.filter((r) => r !== mark);
    if (state === "INVALID") mark.Marks_Obtained = 999;
    if (state === "DUPLICATE") db.Marks_Log.push({ ...mark, Marks_Obtained: 23 });
    if (state === "CONFIGURATION") db.exam_scheme.find((r) => r.Exam_ID === "E1" && r.Subject === "English").Max_Marks = 0;
    if (state === "N/A") db.exam_scheme = db.exam_scheme.filter((r) => r.Subject !== "English");
    if (state === "BAD_SCALE") db.Grading_System = [{ Min_Percentage: "bad", Max_Percentage: 100, Grade: "HIGH" }];
    const data = resolve(db);
    if (state === "N/A") data.subjectColumns.push({ key: "english", subject: "English" });
    const row = model(data).rows.find((r) => r.subject === "English");
    if (state === "AB") {
      assert.equal(row.examCells[0].display, "AB/25");
      assert.equal(row.subjectTotal.display, "49/75");
      assert.equal(row.overallPercentage, "65.3%");
      assert.equal(row.overallGrade, calculateGradeInfo(49 / 75 * 100).grade);
      assert.equal(data.cadet.passStatus, "FAIL");
      assert.equal(data.cadet.totalMaxMarks, 615);
      assert.equal(data.cadet.totalObtained, 549);
      assert.equal(data.cadet.meritRank, 1);
    } else if (state === "N/A") {
      assert.equal(row.overallPercentage, "N/A");
      assert.equal(row.overallGrade, "N/A");
    } else {
      assert.equal(row.overallPercentage, state === "BAD_SCALE" ? "97.3%" : "-");
      assert.equal(row.overallGrade, "-");
      assert.equal(data.cadet.isFinal, false);
      assert.equal(data.cadet.letterGrade, null);
      assert.equal(data.cadet.meritRank, null);
    }
    await assertOutputs(data);
  }
});

test("single-exam results retain original subject presentation and summary", () => {
  const data = resolve(database(), "E1");
  const row = buildResultRows(data.cadet, data.assessmentColumns).find((r) => r.subject === "English");
  assert.equal(row.percentage, "96%");
  assert.equal(row.grade, "A++");
  assert.equal(data.cadet.subjectTotals.English.pct, undefined);
  assert.deepEqual(buildResultSummary(data.cadet), {
    total: "188 / 205", percentage: "91.7%", grade: "A+", rank: "#1", status: "PASS",
  });
});

test("long All Exams PDF repeats headers and keeps rows and signatures within page bounds", () => {
  const db = database();
  for (let index = 0; index < 24; index++) {
    db.exam_scheme.push({ ...db.exam_scheme[0], Subject: `Synthetic Subject ${index}` });
    db.Marks_Log.push({ ...db.Marks_Log[0], Subject: `Synthetic Subject ${index}` });
  }
  const doc = pdf(resolve(db));
  assert.ok(doc.getNumberOfPages() > 1);
  assert.equal(doc.lastAutoTable.head.length, 1);
  assert.equal(doc.lastAutoTable.body.length, 36);
  assert.ok(doc.lastAutoTable.body.every((row) => row.height < 20));
  assert.ok(doc.lastAutoTable.finalY + 17 < doc.internal.pageSize.getHeight() - 10);
});

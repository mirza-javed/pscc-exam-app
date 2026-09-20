import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import { ALL_EXAMS, ALL_SECTIONS, resolveClassResults } from "../lib/examinationResults.mjs";
import { buildMeritMasterSheetTableModel, renderCadetResultCardToDoc } from "../lib/pdfGenerator.js";

test("individual All Exams PDF renders the shared matrix model", () => {
  const db = {
    Students: [{ Kit_No: "100", Name: "Cadet One", Grade: "9", Section: "A", Group: "General" }],
    exam_scheme: [
      { Exam_ID: "E1", Exam_Name: "Monthly", Academic_Session: "2026-27", Exam_Order: 1, Grade: "9", Subject: "English", Max_Marks: 50 },
      { Exam_ID: "E1", Exam_Name: "Monthly", Academic_Session: "2026-27", Exam_Order: 1, Grade: "9", Subject: "Physics", Max_Marks: 50 },
      { Exam_ID: "E2", Exam_Name: "Term", Academic_Session: "2026-27", Exam_Order: 2, Grade: "9", Subject: "English", Max_Marks: 100 },
    ],
    Marks_Log: [
      { Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: 40 },
      { Kit_No: "100", Exam_ID: "E1", Subject: "Physics", Marks_Obtained: 45 },
      { Kit_No: "100", Exam_ID: "E2", Subject: "English", Marks_Obtained: 80 },
    ],
    Grading_System: [],
  };
  const resolved = resolveClassResults(db, "9", "A", ALL_EXAMS, "2026-27");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  renderCadetResultCardToDoc(doc, {
    cadet: resolved.results[0],
    grade: "9",
    section: "A",
    exam: ALL_EXAMS,
    examColumns: resolved.examColumns,
    subjectColumns: resolved.subjectColumns,
  });
  assert.ok(doc.lastAutoTable?.finalY > 0);
  assert.ok(doc.output("arraybuffer").byteLength > 1000);
});

test("ALL Sections PDF table model preserves the full cohort, actual sections, and grade ranks", () => {
  const db = {
    Students: [
      { Kit_No: "100", Name: "Cadet A", Grade: "9", Section: "A" },
      { Kit_No: "200", Name: "Cadet B", Grade: "9", Section: "B" },
      { Kit_No: "300", Name: "Cadet C", Grade: "9", Section: "C" },
    ],
    exam_scheme: [
      { Exam_ID: "E1", Exam_Name: "Term", Academic_Session: "2026-27", Exam_Order: 1, Grade: "9", Subject: "English", Max_Marks: 100 },
    ],
    Marks_Log: [
      { Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: 70 },
      { Kit_No: "200", Exam_ID: "E1", Subject: "English", Marks_Obtained: 90 },
      { Kit_No: "300", Exam_ID: "E1", Subject: "English", Marks_Obtained: 80 },
    ],
    Grading_System: [],
  };
  const resolved = resolveClassResults(db, "9", ALL_SECTIONS, "E1", "2026-27");
  const model = buildMeritMasterSheetTableModel({
    meritGrid: resolved.results,
    section: ALL_SECTIONS,
    exam: "E1",
    assessmentColumns: resolved.assessmentColumns,
  });

  assert.deepEqual(model.head[0].slice(0, 5), ["Grade/Class Rank", "Kit #", "Cadet Name", "Section", "Group"]);
  assert.deepEqual(model.body.map((row) => row.slice(0, 4)), [
    ["#1", "200", "Cadet B", "B"],
    ["#2", "300", "Cadet C", "C"],
    ["#3", "100", "Cadet A", "A"],
  ]);
});

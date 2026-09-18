import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import { ALL_EXAMS, resolveClassResults } from "../lib/examinationResults.mjs";
import { renderCadetResultCardToDoc } from "../lib/pdfGenerator.js";

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

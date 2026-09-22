import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { ALL_EXAMS, ALL_SECTIONS, resolveClassResults } from "../lib/examinationResults.mjs";
import {
  buildMeritMasterSheetTableModel,
  renderCadetResultCardToDoc,
  renderPerformerSummaryToDoc,
} from "../lib/pdfGenerator.js";

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

test("individual result PDF embeds a supplied cadet photo without changing result values", () => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imageFormats = [];
  const originalAddImage = doc.addImage.bind(doc);
  doc.addImage = (...args) => {
    imageFormats.push(args[1]);
    return originalAddImage(...args);
  };
  const cadet = {
    Kit_No: "26002",
    Name: "Photo Cadet",
    Section: "A",
    Group: "General",
    isFinal: true,
    isPassed: true,
    passStatus: "PASS",
    totalObtained: 80,
    totalMaxMarks: 100,
    aggregatePct: 80,
    letterGrade: "A",
    meritRank: 1,
    exams: [],
    scores: {},
  };
  renderCadetResultCardToDoc(doc, {
    cadet,
    grade: "9",
    section: "A",
    exam: "E1",
    totalCadets: 1,
    cadetPhotoDataUri: `data:image/webp;base64,${readFileSync(new URL("../public/cadet-photos/26002.webp", import.meta.url)).toString("base64")}`,
  });
  assert.ok(imageFormats.includes("WEBP"));
  assert.equal(cadet.totalObtained, 80);
  assert.equal(cadet.aggregatePct, 80);
});

test("analytics PDF performer summary includes a dedicated page and tolerates missing photos", () => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "legal" });
  const performer = {
    Kit_No: "26002",
    Name: "Summary Cadet",
    Section: "B",
    meritRank: 1,
    aggregatePct: 91.6,
    totalObtained: 916,
    totalMaxMarks: 1000,
    letterGrade: "A+",
    passStatus: "PASS",
  };
  renderPerformerSummaryToDoc(doc, {
    topPerformers: [performer],
    bottomPerformers: [{ ...performer, Kit_No: "26003", meritRank: 20, aggregatePct: 42 }],
    grade: "10",
    section: ALL_SECTIONS,
    exam: "E1",
    academicSession: "2026-27",
  });
  assert.equal(doc.internal.getNumberOfPages(), 2);
  assert.ok(doc.output("arraybuffer").byteLength > 1000);
});

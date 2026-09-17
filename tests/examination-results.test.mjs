import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSENCE_VALUES,
  ALL_EXAMS,
  getAssessment,
  resolveClassResults,
} from "../lib/examinationResults.mjs";
import { buildResultRows, buildResultSummary, formatAssessment } from "../lib/resultPresentation.mjs";
import { calculateGradeInfo } from "../lib/grading.js";

function scheme(examId, subject, maximum = "100", session = "2026-27") {
  return {
    Exam_ID: examId,
    Exam_Name: examId === "E1" ? "Monthly" : "Final",
    Academic_Session: session,
    Grade: "9",
    Subject: subject,
    Max_Marks: maximum,
  };
}

function mark(kitNo, examId, subject, obtained) {
  return { Kit_No: kitNo, Exam_ID: examId, Subject: subject, Marks_Obtained: obtained };
}

function database(overrides = {}) {
  return {
    Students: [
      { Kit_No: "100", Name: "Cadet One", Grade: "9", Section: "A", Group: "Bio" },
      { Kit_No: "101", Name: "Cadet Two", Grade: "9", Section: "A", Group: "Bio" },
    ],
    exam_scheme: [scheme("E1", "English"), scheme("E1", "Physics")],
    Marks_Log: [
      mark("100", "E1", "English", "80"),
      mark("100", "E1", "Physics", "70"),
      mark("101", "E1", "English", "60"),
      mark("101", "E1", "Physics", "50"),
    ],
    Grading_System: [],
    ...overrides,
  };
}

function result(db, exam = "E1", session = "2026-27", kitNo = "100") {
  return resolveClassResults(db, "9", "A", exam, session).results.find((row) => row.Kit_No === kitNo);
}

test("identical duplicate marks collapse and conflicting duplicates block independent of row order", () => {
  const identical = database({
    Marks_Log: [
      mark("100", "E1", "English", "80"),
      mark("100", "E1", "English", "80.0"),
      mark("100", "E1", "Physics", "70"),
    ],
  });
  assert.equal(result(identical).totalObtained, 150);

  const rows = [
    mark("100", "E1", "English", "80"),
    mark("100", "E1", "English", "81"),
    mark("100", "E1", "Physics", "70"),
  ];
  for (const ordered of [rows, [...rows].reverse()]) {
    const cadet = result(database({ Marks_Log: ordered }));
    assert.equal(cadet.resultStatus, "INVALID");
    assert.equal(cadet.totalObtained, null);
    assert.equal(cadet.assessments.E1.English.message, "Duplicate marks found — correction required");
  }
});

test("every approved absence value becomes zero with full maximum and automatic fail", () => {
  for (const value of ABSENCE_VALUES) {
    const cadet = result(database({
      Marks_Log: [mark("100", "E1", "English", value), mark("100", "E1", "Physics", "90")],
    }));
    assert.equal(cadet.assessments.E1.English.state, "ABSENT", value);
    assert.equal(cadet.assessments.E1.English.obtained, 0, value);
    assert.equal(cadet.totalMaxMarks, 200, value);
    assert.equal(cadet.totalObtained, 90, value);
    assert.equal(cadet.passStatus, "FAIL", value);
  }
});

test("missing row and blank mark produce incomplete result without grade, decision, or rank", () => {
  for (const marks of [
    [mark("100", "E1", "English", "80")],
    [mark("100", "E1", "English", "80"), mark("100", "E1", "Physics", "")],
  ]) {
    const cadet = result(database({ Marks_Log: marks }));
    assert.equal(cadet.resultStatus, "INCOMPLETE");
    assert.equal(cadet.letterGrade, null);
    assert.equal(cadet.meritRank, null);
    assert.equal(cadet.totalObtained, null);
  }
  assert.equal(result(database({ Marks_Log: [mark("100", "E1", "English", "0"), mark("100", "E1", "Physics", "40")] })).isFinal, true);
});

test("maximum marks require one exact positive finite exam-grade-subject scheme", () => {
  assert.equal(result(database()).totalMaxMarks, 200);
  const missing = result(database({ exam_scheme: [scheme("E1", "English")] }));
  assert.equal(missing.expectedAssessments.length, 1);

  const duplicated = result(database({ exam_scheme: [scheme("E1", "English"), scheme("E1", "English"), scheme("E1", "Physics")] }));
  assert.equal(duplicated.resultStatus, "CONFIGURATION_ERROR");

  for (const maximum of ["", "Infinity", "100 marks", "0", "-1"]) {
    const invalid = result(database({ exam_scheme: [scheme("E1", "English", maximum), scheme("E1", "Physics")] }));
    assert.equal(invalid.resultStatus, "CONFIGURATION_ERROR", maximum);
  }

  const wrongExam = resolveClassResults(database(), "9", "A", "E2", "2026-27");
  assert.ok(wrongExam.issues.some((issue) => issue.code === "NO_VALID_EXAMS"));
});

test("All Exams includes only the selected grade and session and preserves exam identity", () => {
  const db = database({
    exam_scheme: [
      scheme("E1", "English", "50"),
      scheme("E1", "Physics", "50"),
      scheme("E2", "English", "100"),
      scheme("E2", "Physics", "100"),
      scheme("OLD", "English", "100", "2025-26"),
    ],
    Marks_Log: [
      mark("100", "E1", "English", "40"),
      mark("100", "E1", "Physics", "45"),
      mark("100", "E2", "English", "80"),
      mark("100", "E2", "Physics", "90"),
      mark("100", "OLD", "English", "100"),
    ],
  });
  const resolved = resolveClassResults(db, "9", "A", ALL_EXAMS, "2026-27");
  const cadet = resolved.results.find((row) => row.Kit_No === "100");
  assert.deepEqual(resolved.exams.map((exam) => exam.examId), ["E1", "E2"]);
  assert.equal(getAssessment(cadet, resolved.assessmentColumns.find((column) => column.examId === "E1" && column.subject === "English")).obtained, 40);
  assert.equal(getAssessment(cadet, resolved.assessmentColumns.find((column) => column.examId === "E2" && column.subject === "English")).obtained, 80);
  assert.equal(cadet.totalObtained, 255);
  assert.equal(cadet.totalMaxMarks, 300);
  assert.equal(cadet.aggregatePct, 85);
  assert.equal(cadet.letterGrade, "A");
});

test("All Exams becomes incomplete when any included assessment is missing", () => {
  const db = database({
    exam_scheme: [scheme("E1", "English"), scheme("E2", "English")],
    Marks_Log: [mark("100", "E1", "English", "80")],
  });
  assert.equal(result(db, ALL_EXAMS).resultStatus, "INCOMPLETE");
});

test("subject threshold, absence, and high overall failure rules are enforced", () => {
  const exact = result(database({ Marks_Log: [mark("100", "E1", "English", "40"), mark("100", "E1", "Physics", "100")] }));
  assert.equal(exact.passStatus, "PASS");
  const below = result(database({ Marks_Log: [mark("100", "E1", "English", "39"), mark("100", "E1", "Physics", "100")] }));
  assert.equal(below.aggregatePct, 69.5);
  assert.equal(below.passStatus, "FAIL");
  const absent = result(database({ Marks_Log: [mark("100", "E1", "English", "AB"), mark("100", "E1", "Physics", "100")] }));
  assert.equal(absent.passStatus, "FAIL");
});

test("ranking orders by percentage then obtained marks, shares exact ties, ranks failures, and excludes incomplete results", () => {
  const tieDb = database({
    exam_scheme: [scheme("E1", "English", "100"), scheme("E1", "Physics", "50")],
    Marks_Log: [
      mark("100", "E1", "English", "30"), mark("100", "E1", "Physics", "30"),
      mark("101", "E1", "English", "40"), mark("101", "E1", "Physics", "20"),
    ],
  });
  const tied = resolveClassResults(tieDb, "9", "A", "E1", "2026-27").results;
  assert.equal(tied[0].aggregatePct, 40);
  assert.equal(tied[0].meritRank, 1);
  assert.equal(tied[1].meritRank, 1);
  assert.equal(tied[0].passStatus, "FAIL");

  const incompleteDb = database({ Marks_Log: [
    mark("100", "E1", "English", "90"), mark("100", "E1", "Physics", "90"),
    mark("101", "E1", "English", "100"),
  ] });
  const incomplete = result(incompleteDb, "E1", "2026-27", "101");
  assert.equal(incomplete.meritRank, null);
});

test("malformed legacy marks never become numeric or absent", () => {
  for (const value of ["45abc", "-1", "Infinity", "101"]) {
    const cadet = result(database({ Marks_Log: [mark("100", "E1", "English", value), mark("100", "E1", "Physics", "50")] }));
    assert.equal(cadet.resultStatus, "INVALID", value);
  }
});

test("Conduct uses the same configured assessment framework and contributes to totals", () => {
  const cadet = result(database({
    exam_scheme: [scheme("E1", "English", "100"), scheme("E1", "Conduct", "25")],
    Marks_Log: [mark("100", "E1", "English", "80"), mark("100", "E1", "Conduct", "20")],
  }));
  assert.equal(cadet.totalObtained, 100);
  assert.equal(cadet.totalMaxMarks, 125);
  assert.equal(cadet.aggregatePct, 80);
});

test("the college-wide grading utility is deterministic at boundaries", () => {
  assert.equal(calculateGradeInfo(95).grade, "A++");
  assert.equal(calculateGradeInfo(90).grade, "A+");
  assert.equal(calculateGradeInfo(40).grade, "E");
  assert.equal(calculateGradeInfo(39.99).status, "FAIL");
  const rows = [
    { Min_Percentage: "0", Max_Percentage: "39.99", Grade: "U" },
    { Min_Percentage: "40", Max_Percentage: "100", Grade: "P" },
  ];
  assert.deepEqual(calculateGradeInfo(40, rows), calculateGradeInfo(40, [...rows].reverse()));
});

test("screen, PDF, and Excel adapters share the same resolved presentation values", () => {
  const resolved = resolveClassResults(database(), "9", "A", "E1", "2026-27");
  const cadet = resolved.results.find((row) => row.Kit_No === "100");
  const rows = buildResultRows(cadet, resolved.assessmentColumns);
  const english = rows.find((row) => row.subject === "English");
  const direct = formatAssessment(cadet.assessments.E1.English);
  assert.equal(english.maximum, direct.maximum);
  assert.equal(english.obtained, direct.obtained);
  assert.equal(english.percentage, direct.percentage);
  assert.equal(english.grade, direct.grade);
  assert.deepEqual(buildResultSummary(cadet), {
    total: "150 / 200",
    percentage: "75%",
    grade: "B+",
    rank: "#1",
    status: "PASS",
  });
});

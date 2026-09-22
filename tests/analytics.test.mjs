import assert from "node:assert/strict";
import test from "node:test";
import { buildClassAnalyticsData } from "../lib/analytics.js";
import { ALL_SECTIONS, resolveClassResults } from "../lib/examinationResults.mjs";

function scheme(subject) {
  return {
    Exam_ID: "E1",
    Exam_Name: "Term",
    Academic_Session: "2026-27",
    Exam_Order: 1,
    Grade: "9",
    Subject: subject,
    Max_Marks: 100,
  };
}

function mark(kitNo, subject, obtained) {
  return { Kit_No: kitNo, Exam_ID: "E1", Subject: subject, Marks_Obtained: obtained };
}

test("ALL Sections recalculates one grade-wide ranking and keeps actual sections in result keys", () => {
  const students = [
    ["100", "A", 100],
    ["200", "B", 90],
    ["300", "C", 80],
    ["301", "C", 80],
  ];
  const db = {
    Students: students.map(([Kit_No, Section]) => ({ Kit_No, Name: `Cadet ${Kit_No}`, Grade: "9", Section })),
    exam_scheme: [scheme("English")],
    Marks_Log: students.map(([kitNo, , score]) => mark(kitNo, "English", score)),
    Grading_System: [],
  };

  const combined = resolveClassResults(db, "9", ALL_SECTIONS, "E1", "2026-27");
  assert.deepEqual(combined.results.map((cadet) => [cadet.Kit_No, cadet.Section, cadet.meritRank]), [
    ["100", "A", 1],
    ["200", "B", 2],
    ["300", "C", 3],
    ["301", "C", 3],
  ]);
  assert.ok(combined.results.every((cadet) => cadet.resultKey.includes(`|${cadet.Section.toLowerCase()}|`)));
  assert.ok(combined.results.every((cadet) => !cadet.resultKey.includes("|all|")));

  assert.deepEqual(
    resolveClassResults(db, "9", "A", "E1", "2026-27").results.map((cadet) => [cadet.Kit_No, cadet.meritRank]),
    [["100", 1]]
  );
  assert.deepEqual(
    resolveClassResults(db, "9", "B", "E1", "2026-27").results.map((cadet) => [cadet.Kit_No, cadet.meritRank]),
    [["200", 1]]
  );
  assert.deepEqual(
    resolveClassResults(db, "9", "C", "E1", "2026-27").results.map((cadet) => [cadet.Kit_No, cadet.meritRank]),
    [["300", 1], ["301", 1]]
  );

  const analytics = buildClassAnalyticsData(db, "9", ALL_SECTIONS, "E1", "2026-27");
  assert.deepEqual(analytics.kpis.topPerformers.map((cadet) => cadet.Kit_No), ["100", "200", "300", "301"]);
  assert.deepEqual(
    analytics.kpis.topPerformers.map((cadet) => [cadet.Kit_No, cadet.Section, cadet.meritRank]),
    [["100", "A", 1], ["200", "B", 2], ["300", "C", 3], ["301", "C", 3]]
  );
  assert.deepEqual(
    buildClassAnalyticsData(db, "9", "C", "E1", "2026-27").kpis.topPerformers
      .map((cadet) => [cadet.Kit_No, cadet.Section, cadet.meritRank]),
    [["300", "C", 1], ["301", "C", 1]]
  );
  for (const section of ["A", "B", "C"]) {
    const sectionAnalytics = buildClassAnalyticsData(db, "9", section, "E1", "2026-27");
    assert.ok(sectionAnalytics.kpis.topPerformers.every((cadet) => cadet.Section === section));
    assert.ok(sectionAnalytics.kpis.bottomPerformers.every((cadet) => cadet.Section === section));
  }
});

test("attendance, incomplete subject contribution, and bottom ties follow the approved policies", () => {
  const db = {
    Students: [
      { Kit_No: "100", Name: "Fully Absent", Grade: "9", Section: "A" },
      { Kit_No: "200", Name: "Partial Attendance", Grade: "9", Section: "B" },
      { Kit_No: "300", Name: "Incomplete", Grade: "9", Section: "C" },
      { Kit_No: "400", Name: "Low Tie One", Grade: "9", Section: "A" },
      { Kit_No: "401", Name: "Low Tie Two", Grade: "9", Section: "B" },
    ],
    exam_scheme: [scheme("English"), scheme("Physics")],
    Marks_Log: [
      mark("100", "English", "AB"), mark("100", "Physics", "AB"),
      mark("200", "English", 60), mark("200", "Physics", "AB"),
      mark("300", "Physics", 70),
      mark("400", "English", 20), mark("400", "Physics", 20),
      mark("401", "English", 20), mark("401", "Physics", 20),
    ],
    Grading_System: [],
  };

  const analytics = buildClassAnalyticsData(db, "9", ALL_SECTIONS, "E1", "2026-27");
  assert.equal(analytics.kpis.appearedCount, 4);
  assert.equal(analytics.kpis.absentCount, 1);
  assert.equal(analytics.kpis.incompleteCadets, 1);
  assert.ok(analytics.kpis.bottomPerformers.every((cadet) => cadet.isFinal && cadet.isValid));
  assert.deepEqual(
    analytics.kpis.bottomPerformers.filter((cadet) => cadet.aggregatePct === 20).map((cadet) => cadet.Kit_No),
    ["400", "401"]
  );
  assert.ok(analytics.kpis.bottomPerformers.every((cadet) => cadet.rankEligible));
  assert.ok(analytics.kpis.bottomPerformers.every((cadet) => !["INCOMPLETE", "INVALID", "CONFIGURATION_ERROR"].includes(cadet.resultStatus)));

  const physics = analytics.subjectAverages.find((subject) => subject.subject === "Physics");
  assert.equal(physics.assessedStudents, 5);
  assert.equal(physics.absentStudents, 2);
  assert.equal(physics.absentAssessments, 2);
  assert.equal(physics.highestPercentage, 70);
  assert.equal(physics.lowestPercentage, 0);
});

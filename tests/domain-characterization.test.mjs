import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeValue } from "../lib/authorization.mjs";
import { normalizeWriteKey, parseTabRows } from "../lib/repositories/sheetRows.mjs";
import { normalizeMarkValue, getAcademicSession, resolveClassResults, buildResultKey } from "../lib/examinationResults.mjs";
import { resolveMaxMarks } from "../lib/models.js";
import { validateMarksSubmission } from "../lib/marksValidation.mjs";
import { buildClassAnalyticsData } from "../lib/analytics.js";
import { calculateGradeInfo } from "../lib/grading.js";
import { formatAssessment, formatAssessmentFraction } from "../lib/resultPresentation.mjs";
const db = () => ({ Students: ["001", "002", "003"].map(Kit_No => ({ Kit_No, Grade: "9", Section: "A" })), exam_scheme: [{ Exam_ID: "E  1", Exam_Name: "Display", Grade: "9", Subject: "English", Max_Marks: "100", Academic_Session: "2026" }], Marks_Log: ["001", "002", "003"].map((Kit_No, i) => ({ Kit_No, Exam_ID: "E  1", Subject: "English", Marks_Obtained: i === 2 ? "40" : "80" })) });
test("normalization variants preserve Unicode, whitespace, case and string identifiers", () => {
  assert.equal(normalizeValue(" \uFF25  \uFF11\t X "), "e 1 x");
  assert.equal(normalizeWriteKey(" \uFF25  \uFF11\t X "), "e  1\t x");
  assert.equal(normalizeValue("001"), "001");
  assert.notEqual(normalizeValue("001"), normalizeValue(1));
  assert.equal(normalizeValue(null), "");
  assert.equal(getAcademicSession({ Academic_Session: "", Academic_Year: "2026" }), "");
  assert.equal(getAcademicSession({ Academic_Year: " 2026 " }), "2026");
  assert.equal(buildResultKey({ kitNo: "001", grade: "9", section: " A ", academicSession: "2026", selectedExam: "E  1" }), "001|9|a|2026|e 1");
});
test("historical marks distinguish absence, missing, zero and invalid", () => {
  for (const token of ["ab", "a", "absent", "a/b", "n/a", "na", "-"]) assert.equal(normalizeMarkValue(` ${token.toUpperCase()} `).state, "ABSENT");
  for (const value of [null, undefined, "", " "]) assert.equal(normalizeMarkValue(value).state, "MISSING");
  assert.equal(normalizeMarkValue(0).state, "PRESENT");
  for (const value of ["45abc", -1, Infinity, "1e2", "\uFF21\uFF22"]) assert.equal(normalizeMarkValue(value).state, "INVALID");
  assert.equal(formatAssessment(null).state, "MISSING");
  assert.equal(formatAssessmentFraction(null).state, "NOT_APPLICABLE");
});
test("exact scheme matching retains model/domain normalization differences and write attendance", () => {
  const data = db();
  assert.equal(resolveMaxMarks("e 1", "9", "English", data), null);
  assert.equal(resolveMaxMarks("e  1", "9", "English", data), 100);
  assert.equal(resolveMaxMarks("Display", "9", "English", data), null);
  assert.equal(resolveMaxMarks("E  1", "10", "English", data), null);
  const body = { examId: "\uFF45 1", grade: "\uFF19", section: "a", subject: "english", records: [{ Kit_No: "001", attendance: "present", Marks_Obtained: 0 }] };
  assert.equal(validateMarksSubmission(body, data).valid, true);
  for (const attendance of ["ab", "a", "n/a"]) assert.equal(validateMarksSubmission({ ...body, records: [{ Kit_No: "001", attendance }] }, data).valid, false);
  data.exam_scheme.push({ ...data.exam_scheme[0] });
  assert.equal(resolveMaxMarks("E  1", "9", "English", data), null);
  assert.equal(validateMarksSubmission(body, data).errors[0].code, "AMBIGUOUS_EXAM_SCHEME");
});
test("grading boundaries and competition ranks remain exact", () => {
  for (const [pct, grade] of [[0,"U"],[39.99,"U"],[40,"E"],[50,"D"],[60,"C"],[70,"B"],[75,"B+"],[80,"B++"],[85,"A"],[90,"A+"],[95,"A++"],[100,"A++"]]) assert.equal(calculateGradeInfo(pct).grade, grade);
  const results = resolveClassResults(db(), "9", "a", "e 1").results;
  assert.deepEqual(results.map(x => x.meritRank), [1,1,3]);
  const analytics = buildClassAnalyticsData(db(), "9", "A", "E  1");
  assert.deepEqual(analytics.kpis.bottomPerformers.map(x => x.bottomRank), [1,2,2]);
});
test("publication display selects timestamp order and leaves unmatched official changes explicit", () => {
  const data = db();
  const result = resolveClassResults(data, "9", "A", "E  1").results[0];
  const event = { Result_Key: result.resultKey, Calculation_Fingerprint: result.calculationFingerprint };
  data.Result_Publications = [{ ...event, Recorded_At: "2026-10-02", Result_Status: "Published" }, { ...event, Recorded_At: "2026-10-01", Result_Status: "Draft" }];
  assert.equal(buildClassAnalyticsData(data,"9","A","E  1").meritGrid[0].publicationStatus, "Published");
  data.Result_Publications[0].Calculation_Fingerprint = "changed";
  assert.equal(buildClassAnalyticsData(data,"9","A","E  1").meritGrid[0].publicationStatus, "UNPUBLISHED_CHANGES");
  data.Result_Publications[1].Recorded_At = "invalid";
  assert.equal(buildClassAnalyticsData(data,"9","A","E  1").meritGrid[0].publicationStatus, "Draft");
});
test("row aliases retain strings and portal inconsistencies remain explicit", () => {
  assert.deepEqual(parseTabRows([["Student_ID", "Full Name", "Stream"],["001", " Cadet ", "Bio"]], "Students"), [{ Student_ID: "001", "Full Name": "Cadet", Stream: "Bio", Kit_No: "001", Group: "Bio", Name: "Cadet" }]);
  const portal = readFileSync(new URL("../components/MarksEntry/MarksEntryPortal.jsx", import.meta.url), "utf8");
  assert.ok(portal.includes('r.Exam_ID || r.Exam_Name'));
  assert.ok(portal.includes('EXAM_MID_TERM_2026'));
  assert.ok(portal.includes('String(s.Section || "").trim() === String(selectedSection).trim()'));
});

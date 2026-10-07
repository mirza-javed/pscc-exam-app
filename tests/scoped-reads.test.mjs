import "./helpers/serverImports.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { resourceFixture } from "./helpers/resourceFixture.mjs";
import { projectDatabase } from "../lib/authorization.mjs";
import { buildClassAnalyticsData } from "../lib/analytics.js";
const { createResourceReadService } = await import("../lib/services/resourceReadService.mjs");
const error = (status, code) => (e) => e.status === status && (!code || e.code === code);
function setup() {
  const f = resourceFixture();
  f.reads = [];
  f.service = createResourceReadService({ loadFreshDatabaseTabs: async (tabs) => {
    f.reads.push(tabs);
    return Object.fromEntries(tabs.map((tab) => [tab, structuredClone(f.db[tab] || [])]));
  } });
  f.get = (resource, query = "", current = f.current) => f.service(resource, current, new URLSearchParams(query));
  return f;
}
test("every scoped service rejects unauthenticated and unknown roles before data reads", async () => {
  const f = setup();
  for (const resource of ["config", "students", "marks", "analytics"]) {
    await assert.rejects(f.get(resource, "", null), error(401));
    await assert.rejects(f.get(resource, "", f.context({ ...f.teacher, Role: "Unknown" })), error(403));
  }
  assert.equal(f.reads.length, 0);
});
test("teacher section reads retain full-subject read access but never unrelated cadets", async () => {
  const f = setup(), teacher = f.context(f.teacher);
  assert.equal((await f.get("students", "", teacher)).items.length, 2);
  assert.equal((await f.get("marks", "subject=Mathematics", teacher)).items.length, 4);
  assert.equal((await f.get("marks", "subject=English&examId=E1", teacher)).items.length, 2);
  await assert.rejects(f.get("students", "grade=10&section=B", teacher), error(403));
  await assert.rejects(f.get("marks", "grade=9&section=A", teacher), error(403));
  assert.deepEqual((await f.get("students", "kitNo=120", teacher)).items, []);
  assert.deepEqual((await f.get("marks", "kitNo=120", teacher)).items, []);
});
test("section-only filters intersect server authorization and class teachers read their section", async () => {
  const f = setup();
  const current = f.context({ ...f.teacher, Role: "Class Teacher", Class_Teacher_Of: "10", Section_Of: "B" });
  assert.equal((await f.get("students", "section=B", current)).items.length, 2);
  assert.deepEqual((await f.get("students", "section=C", current)).items, []);
});
test("ALL requires authoritative full-grade eligibility including sections absent from projected data", async () => {
  const f = setup();
  await assert.rejects(f.get("analytics", "grade=10&section=ALL&academicSession=2026-27", f.context(f.teacher)), error(403));
  for (const section of ["B", "C"]) f.db.Teaching_Assignments[0][`Assigned_Section_${section}`] = "TRUE";
  const response = await f.get("analytics", "grade=10&section=ALL&academicSession=2026-27", f.context(f.teacher));
  assert.equal(response.data.Students.length, 6);
  assert.deepEqual(new Set(response.data.Students.map((s) => s.Section)), new Set(["A", "B", "C"]));
  assert.equal(response.data.Authorization_Scope.fullGradeRead["10"], true);
  f.db.Students.push({ Kit_No: "130", Grade: "10", Section: "D" });
  await assert.rejects(f.get("students", "grade=10&section=ALL", f.context(f.teacher)), error(403));
});
test("preview uses fresh effective scope and limits teacher previews", async () => {
  const f = setup();
  assert.equal((await f.get("students", "previewTeacherId=T1")).items.length, 2);
  await assert.rejects(f.get("students", "previewTeacherId=T1&grade=10&section=C"), error(403));
  await assert.rejects(f.get("config", "previewTeacherId=missing"), error(404, "PREVIEW_STAFF_NOT_FOUND"));
  await assert.rejects(f.get("students", "previewTeacherId=ADMIN", f.context(f.teacher)), error(403));
  f.teacher.Active = "FALSE";
  await assert.rejects(f.get("students", "previewTeacherId=T1"), error(404));
});
test("strict filters reject unknown, repeated, malformed, oversized and unsupported active values", async () => {
  const f = setup();
  for (const query of ["active=true", "grade=10&grade=9", "limit=0", "limit=201", "limit=1.5", "limit=abc", "section=ALL", "search=", "search=%00", `search=${"x".repeat(161)}`, "__proto__=x"]) {
    await assert.rejects(f.get("students", query), error(400, "INVALID_QUERY"));
  }
  await assert.rejects(f.get("analytics", "grade=10"), error(400));
  await assert.rejects(f.get("config", "refresh=yes"), error(400));
  assert.equal(f.reads.length, 0);
});
test("cursor pagination is deterministic, filter/scope bound and detects changed datasets", async () => {
  const f = setup();
  const first = await f.get("students", "limit=2");
  assert.deepEqual(first.items.map((s) => s.Kit_No), ["100", "101"]);
  assert.equal(first.hasMore, true);
  assert.equal((await f.get("students", "limit=2")).nextCursor, first.nextCursor);
  const second = await f.get("students", `cursor=${first.nextCursor}&limit=2`);
  assert.deepEqual(second.items.map((s) => s.Kit_No), ["110", "111"]);
  const third = await f.get("students", `limit=2&cursor=${second.nextCursor}`);
  assert.equal(third.hasMore, false); assert.equal(third.nextCursor, null);
  await assert.rejects(f.get("students", `limit=2&grade=10&cursor=${first.nextCursor}`), error(400, "INVALID_CURSOR"));
  await assert.rejects(f.get("students", `limit=2&cursor=${first.nextCursor}`, f.context(f.teacher)), error(400));
  await assert.rejects(f.get("students", "cursor=garbage"), error(400));
  await assert.rejects(f.get("students", `limit=2&cursor=!!!${first.nextCursor}`), error(400));
  await assert.rejects(f.get("marks", `limit=2&cursor=${first.nextCursor}`), error(400, "INVALID_CURSOR"));
  f.db.Students[0].Name = "Changed synthetic name";
  await assert.rejects(f.get("students", `limit=2&cursor=${first.nextCursor}`), error(409, "PAGINATION_STALE"));
});
test("marks pagination preserves duplicates and legacy absence values", async () => {
  const f = setup();
  f.db.Marks_Log.unshift({ ...f.db.Marks_Log[0], Submission_ID: "LEGACY", Marks_Obtained: "AB" });
  const result = await f.get("marks", "grade=10&section=A&examId=E1&subject=English&limit=2");
  assert.equal(result.hasMore, true);
  const next = await f.get("marks", `grade=10&section=A&examId=E1&subject=English&limit=2&cursor=${result.nextCursor}`);
  assert.equal([...result.items, ...next.items].length, 3);
  assert.ok(result.items.some((r) => r.Marks_Obtained === "AB"));
});
test("fresh reads have no broader cached response and use only resource prerequisite tabs", async () => {
  const f = setup();
  await f.get("students");
  assert.deepEqual(f.reads[0], ["Students"]);
  await f.get("marks");
  assert.deepEqual(f.reads[1], ["Students", "Marks_Log", "exam_scheme"]);
  f.db.Students[0].Section = "C";
  assert.equal((await f.get("students", "", f.context(f.teacher))).items.length, 1);
  f.db.Teaching_Assignments.length = 0;
  assert.equal((await f.get("students", "", f.context(f.teacher))).items.length, 0);
});
test("config is small, sanitized and selector metadata exposes only authorized sections", async () => {
  const f = setup(); f.db.exam_scheme[0].Internal_Note = "backend-only";
  const teacher = await f.get("config", "", f.context(f.teacher));
  assert.deepEqual(teacher.data.selectors, { 10: ["A"] });
  assert.deepEqual(teacher.data.Staff_Directory, []);
  assert.deepEqual(teacher.data.Preview_Assignments, []);
  assert.equal(teacher.data.Students, undefined); assert.equal(teacher.data.Marks_Log, undefined);
  assert.equal(teacher.data.exam_scheme[0].Internal_Note, undefined);
  const admin = await f.get("config");
  assert.equal(admin.data.Staff_Directory[0].Email, undefined);
  assert.equal(admin.data.Preview_Assignments.length, 1);
});
test("empty datasets and missing resources have explicit contracts", async () => {
  const f = setup();
  assert.deepEqual((await f.get("students", "search=missing")).items, []);
  await assert.rejects(f.get("marks", "examId=missing"), error(404, "EXAM_NOT_FOUND"));
  f.db.Students = []; f.db.Marks_Log = [];
  assert.equal((await f.get("students")).hasMore, false);
  assert.deepEqual((await f.get("marks")).items, []);
  assert.deepEqual((await f.get("analytics", "grade=10&section=A")).data.Students, []);
});
test("cohort academic results equal compatibility results for A/B/C/ALL and single/All Exams", async () => {
  const f = setup();
  const projected = projectDatabase(f.db, f.staff, f.current.permissions);
  for (const section of ["A", "B", "C", "ALL"]) for (const exam of ["E1", "All Exams"]) {
    const response = await f.get("analytics", `grade=10&section=${section}&academicSession=2026-27${exam === "E1" ? "&examId=E1" : ""}`);
    assert.deepEqual(buildClassAnalyticsData(response.data, "10", section, exam, "2026-27"), buildClassAnalyticsData(projected, "10", section, exam, "2026-27"));
  }
});
test("session filtering excludes unrelated exams and preserves publication history order", async () => {
  const f = setup();
  f.db.exam_scheme.push({ Exam_ID: "OLD", Grade: "10", Subject: "English", Max_Marks: "100", Academic_Year: "2025-26", Exam_Order: "1" });
  f.db.Marks_Log.push({ Kit_No: "100", Exam_ID: "OLD", Subject: "English", Marks_Obtained: "AB" });
  f.db.Result_Publications = ["P2", "P1"].map((id) => ({ Publication_Event_ID: id, Kit_No: "100", Result_Key: "100|10|a|2026-27|all", Exam_ID: "E1", Academic_Session: "2026-27" }));
  f.db.Result_Publications.push({ Kit_No: "120", Exam_ID: "E1", Academic_Session: "2026-27" });
  const response = await f.get("analytics", "grade=10&section=A&academicSession=2026-27");
  assert.ok(response.data.Marks_Log.every((m) => m.Exam_ID !== "OLD"));
  assert.deepEqual(response.data.Result_Publications.map((e) => e.Publication_Event_ID), ["P2", "P1"]);
  assert.equal((await f.get("marks", "academicSession=2025-26")).items.length, 1);
});

test("cohort reads preserve Result_Key publication semantics when descriptive legacy fields disagree", async () => {
  const f = setup();
  const result = buildClassAnalyticsData(f.db, "10", "A", "E1", "2026-27").meritGrid.find(s => s.Kit_No === "100");
  f.db.Result_Publications.push({ Publication_Event_ID: "LEGACY-P1", Kit_No: "100", Result_Key: result.resultKey,
    Exam_ID: "legacy description", Academic_Session: "legacy description", Result_Status: "Published", Calculation_Fingerprint: result.calculationFingerprint });
  const response = await f.get("analytics", "grade=10&section=A&examId=E1");
  assert.equal(response.data.Result_Publications.length, 1);
  assert.deepEqual(buildClassAnalyticsData(response.data, "10", "A", "E1", "2026-27"), buildClassAnalyticsData(f.db, "10", "A", "E1", "2026-27"));
});

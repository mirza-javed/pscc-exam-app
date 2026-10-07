import "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { getStaffPermissions } from "../lib/authorization.mjs";
const { createAcademicDataService } = await import("../lib/services/academicDataService.mjs");
const { createMarksService } = await import("../lib/services/marksService.mjs");
const { createResultPublicationService } = await import("../lib/services/resultPublicationService.mjs");

function fixture(role = "Teacher") {
  const staff = { Teacher_ID: "T1", Email: "teacher@example.test", Role: role, Active: "TRUE" };
  const db = {
    Staff_Directory: [staff],
    Teaching_Assignments: [{ Teacher_ID: "T1", Subject: "English", Assigned_Grade: "9", Assigned_Section_A: "yes" }],
    Students: [{ Kit_No: "100", Grade: "9", Section: "A", Name: "Synthetic" }, { Kit_No: "200", Grade: "10", Section: "B" }],
    Marks_Log: [{ Submission_ID: "S1", Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: "80" }],
    exam_scheme: [{ Exam_ID: "E1", Grade: "9", Subject: "English", Max_Marks: "100", Academic_Session: "2026-27", Exam_Order: "1" }],
    Grading_System: [], Result_Publications: [],
  };
  const calls = { reads: [], writes: [], refresh: [] };
  const dependencies = {
    coordinateWrite: async ({ execute }) => execute(),
    loadFreshDatabaseTabs: async (tabs) => { calls.reads.push(tabs); return db; },
    loadMasterDatabase: async (refresh) => { calls.refresh.push(refresh); return { ...db, _cached: true, _cachedAt: 123 }; },
    saveOrUpdateMarksLog: async (records) => { calls.writes.push(records); return { updatedCount: 1, insertedCount: 0, totalCount: 1 }; },
    appendResultPublicationEvent: async (event) => { calls.writes.push(event); return { inserted: true, idempotent: false }; },
  };
  return { db, calls, dependencies, current: { staff, permissions: getStaffPermissions(staff, db), authorizationDb: db } };
}
const body = { examId: "E1", grade: "9", section: "A", subject: "English", records: [{ Kit_No: "100", Submission_ID: "S1", attendance: "present", Marks_Obtained: 90 }] };
const publication = { grade: "9", section: "A", kitNo: "100", examId: "E1", status: "Published" };
function error(status, code) { return (err) => err.status === status && err.code === code; }

test("academic service uses fresh protected data and current assignments, preserves cache metadata", async () => {
  const f = fixture();
  f.dependencies.loadMasterDatabase = async (refresh) => { f.calls.refresh.push(refresh); return { ...f.db, Students: [], Teaching_Assignments: [], _cached: true, _cachedAt: 123 }; };
  const result = await createAcademicDataService(f.dependencies)(f.current, new URLSearchParams("refresh=true"));
  assert.deepEqual(result.data.Students.map((row) => row.Kit_No), ["100"]);
  assert.deepEqual(f.calls.refresh, [false]);
  assert.deepEqual(f.calls.reads, [["Students", "Marks_Log", "Result_Publications"]]);
  assert.equal(result.meta.cached, true);
  assert.equal(result.meta.cachedAt, 123);
  assert.equal(result.meta.counts.students, 1);
});

test("academic preview and refresh remain role restricted", async () => {
  const teacher = fixture();
  await assert.rejects(createAcademicDataService(teacher.dependencies)(teacher.current, new URLSearchParams("previewTeacherId=T1")), error(403, "FORBIDDEN"));
  assert.equal(teacher.calls.reads.length, 0);
  const admin = fixture("Admin_Exam");
  admin.db.Staff_Directory.push(teacher.current.staff);
  admin.db.Staff_Directory[0] = { ...admin.current.staff, Teacher_ID: "ADMIN" };
  const result = await createAcademicDataService(admin.dependencies)(admin.current, new URLSearchParams("refresh=true&previewTeacherId=T1"));
  assert.deepEqual(admin.calls.refresh, [true]);
  assert.equal(result.meta.previewTeacherId, "T1");
  assert.deepEqual(result.data.Students.map((row) => row.Kit_No), ["100"]);
  await assert.rejects(createAcademicDataService(admin.dependencies)(admin.current, new URLSearchParams("previewTeacherId=missing")), error(404, "PREVIEW_STAFF_NOT_FOUND"));
});

test("marks service saves canonical records and preserves receipts", async () => {
  const f = fixture();
  const result = await createMarksService(f.dependencies)(f.current, body);
  assert.equal(result.count, 1);
  assert.equal(result.updatedCount, 1);
  assert.match(result.message, /previous Submission IDs preserved/);
  assert.equal(f.calls.writes[0][0].Marks_Obtained, "90");
});

test("marks service rejects subject, grade, section and submission ownership before invalid marks", async () => {
  for (const change of [{ subject: "Physics" }, { records: [{ ...body.records[0], Kit_No: "200" }] }, { records: [{ ...body.records[0], Submission_ID: "UNKNOWN" }] }]) {
    const f = fixture();
    const candidate = { ...body, ...change };
    candidate.records = candidate.records.map((row) => ({ ...row, Marks_Obtained: "invalid" }));
    await assert.rejects(createMarksService(f.dependencies)(f.current, candidate), error(403, "MARKS_SCOPE_FORBIDDEN"));
    assert.equal(f.calls.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(createMarksService(f.dependencies)(f.current, { ...body, section: "B" }), error(422, "MARKS_VALIDATION_FAILED"));
  assert.equal(f.calls.writes.length, 0);
});

test("marks duplicate and stored conflicts produce validation errors and zero writes", async () => {
  for (const storedDuplicate of [false, true]) {
    const f = fixture();
    if (storedDuplicate) f.db.Marks_Log.push({ ...f.db.Marks_Log[0], Submission_ID: "S2", Marks_Obtained: "50" });
    await assert.rejects(createMarksService(f.dependencies)(f.current, storedDuplicate ? body : { ...body, records: [...body.records, ...body.records] }), error(422, "MARKS_VALIDATION_FAILED"));
    assert.equal(f.calls.writes.length, 0);
  }
});

test("all services reject missing or forbidden staff without reads or writes", async () => {
  const f = fixture("Unknown");
  for (const [factory, input] of [[createAcademicDataService, new URLSearchParams()], [createMarksService, body], [createResultPublicationService, publication]]) {
    await assert.rejects(factory(f.dependencies)(null, input), error(401, "AUTHENTICATION_REQUIRED"));
    await assert.rejects(factory(f.dependencies)(f.current, input), error(403, "FORBIDDEN"));
  }
  assert.equal(f.calls.reads.length, 0);
  assert.equal(f.calls.writes.length, 0);
});

test("failed prerequisite reads stop marks and publication writes", async () => {
  for (const factory of [createMarksService, createResultPublicationService]) {
    const f = fixture("Admin_Exam");
    f.dependencies.loadFreshDatabaseTabs = async () => { throw new Error("synthetic read failure"); };
    await assert.rejects(factory(f.dependencies)(f.current, factory === createMarksService ? body : publication), /synthetic read failure/);
    assert.equal(f.calls.writes.length, 0);
  }
});

test("publication preserves Draft, Published, Revised history and idempotency", async () => {
  const f = fixture("Admin_Exam");
  const service = createResultPublicationService(f.dependencies);
  const draft = await service(f.current, { ...publication, status: "Draft" });
  f.db.Result_Publications.push(draft.event);
  const published = await service(f.current, publication);
  f.db.Result_Publications.push(published.event);
  const repeated = await service(f.current, publication);
  assert.equal(repeated.idempotent, true);
  assert.deepEqual(repeated.event, published.event);
  assert.equal(f.calls.writes.length, 2);
  await assert.rejects(service(f.current, { ...publication, status: "Revised", revisionReason: "Correction" }), error(409, "RESULT_UNCHANGED"));
  f.db.Marks_Log[0].Marks_Obtained = "85";
  await assert.rejects(service(f.current, publication), error(409, "RESULT_ALREADY_PUBLISHED"));
  const revised = await service(f.current, { ...publication, status: "Revised", revisionReason: "Correction" });
  assert.equal(revised.event.Prior_Event_ID, published.event.Publication_Event_ID);
  assert.equal(revised.event.Revision_Reason, "Correction");
  assert.notEqual(revised.event.Calculation_Fingerprint, published.event.Calculation_Fingerprint);
});

test("publication invalid requests, missing results and premature revisions never write", async () => {
  for (const [changes, status, code] of [[{ status: "invalid" }, 422, "PUBLICATION_VALIDATION_FAILED"], [{ kitNo: "missing" }, 404, "RESULT_NOT_FOUND"], [{ status: "Revised", revisionReason: "Correction" }, 409, "RESULT_NOT_PUBLISHED"]]) {
    const f = fixture("Admin_Exam");
    await assert.rejects(createResultPublicationService(f.dependencies)(f.current, { ...publication, ...changes }), error(status, code));
    assert.equal(f.calls.writes.length, 0);
  }
  const f = fixture("Admin_Exam");
  f.db.Marks_Log = [];
  await assert.rejects(createResultPublicationService(f.dependencies)(f.current, publication), error(422, "RESULT_NOT_FINAL"));
});


test("separate unauthorized grade, section and owned-submission targets fail before writes", async () => {
  for (const student of [{ Grade: "10", Section: "A" }, { Grade: "9", Section: "B" }]) {
    const f = fixture();
    Object.assign(f.db.Students[1], student);
    await assert.rejects(createMarksService(f.dependencies)(f.current, { ...body, records: [{ ...body.records[0], Kit_No: "200", Submission_ID: "" }] }), error(403, "MARKS_SCOPE_FORBIDDEN"));
    assert.equal(f.calls.writes.length, 0);
  }
  const f = fixture();
  f.db.Marks_Log[0].Exam_ID = "OTHER";
  await assert.rejects(createMarksService(f.dependencies)(f.current, body), error(403, "MARKS_SCOPE_FORBIDDEN"));
  assert.equal(f.calls.writes.length, 0);
});

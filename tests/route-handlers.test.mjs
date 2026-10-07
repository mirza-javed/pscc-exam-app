import { mockServerModule } from "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { getStaffPermissions } from "../lib/authorization.mjs";
import { SheetWriteError } from "../lib/repositories/sheetRows.mjs";
const state = {};
function reset(role = "Admin_Exam") {
  const staff = { Teacher_ID: "T1", Email: "approved@example.test", Role: role, Active: "TRUE" };
  state.db = {
    Staff_Directory: [staff], Teaching_Assignments: [],
    Students: [{ Kit_No: "100", Grade: "9", Section: "A" }],
    Marks_Log: [{ Kit_No: "100", Exam_ID: "E1", Subject: "English", Marks_Obtained: "80" }],
    exam_scheme: [{ Exam_ID: "E1", Grade: "9", Subject: "English", Max_Marks: "100", Academic_Session: "2026-27", Exam_Order: 1 }],
    Grading_System: [], Result_Publications: [],
  };
  state.current = { staff, permissions: getStaffPermissions(staff, state.db), authorizationDb: state.db };
  state.limit = { configured: true, allowed: true, actorRef: "synthetic", limit: 10, remaining: 9, reset: Date.now() + 60000, policy: { message: "Too many requests." } };
  state.reads = 0; state.writes = 0; state.approvals = 0; state.readError = null; state.writeError = null;
}
mockServerModule("lib/staffAuth.js", {
  getAuthenticatedEmail: async () => "approved@example.test",
  getCurrentStaff: async () => { state.approvals++; return state.current; },
  findActiveStaffByTeacherId: (db, id) => db.Staff_Directory.find((row) => row.Teacher_ID === id),
  getStaffAuthorization: (staff, db) => ({ staff, permissions: getStaffPermissions(staff, db), authorizationDb: db }),
});
mockServerModule("lib/repositories/academicRepository.js", {
  invalidateAcademicCache: () => {},
  loadMasterDatabase: async () => state.db,
  loadFreshDatabaseTabs: async () => { state.reads++; if (state.readError) throw state.readError; return state.db; },
});
mockServerModule("lib/repositories/marksRepository.js", {
  saveOrUpdateMarksLog: async () => { state.writes++; if (state.writeError) throw state.writeError; return { updatedCount: 0, insertedCount: 1, totalCount: 1 }; },
});
mockServerModule("lib/repositories/resultPublicationRepository.js", {
  appendResultPublicationEvent: async () => { state.writes++; if (state.writeError) throw state.writeError; return { inserted: true, idempotent: false }; },
});
// Keep real policy/header/error helpers; only the adapter result is synthetic.
const rateLimit = await import("../lib/rateLimit.mjs");
mockServerModule("lib/rateLimit.mjs", { ...rateLimit, checkRateLimit: async () => state.limit });
mockServerModule("lib/services/writeCoordinationService.mjs", {
  coordinateWrite: async ({ execute }) => execute(),
  assertExpectedState: () => {},
});
const database = await import("../app/api/database/route.js");
const marks = await import("../app/api/marks/route.js");
const publications = await import("../app/api/result-publications/route.js");
const marksBody = { grade: "9", section: "A", examId: "E1", subject: "English", records: [{ Kit_No: "100", attendance: "present", Marks_Obtained: 90 }] };
const publicationBody = { grade: "9", section: "A", examId: "E1", kitNo: "100", status: "Published" };
const cases = [[database.GET, "database", null], [marks.POST, "marks", marksBody], [publications.POST, "result-publications", publicationBody]];
function request(path, body, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/${path}`, {
    method: body === null ? "GET" : "POST",
    headers: { "x-request-id": "synthetic-request-123", Origin: origin, "Content-Type": "application/json" },
    ...(body === null ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
async function check(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("X-Request-ID"), "synthetic-request-123");
  const payload = await response.json();
  if (code) {
    assert.equal(payload.code, code);
    assert.equal(payload.requestId, "synthetic-request-123");
    assert.equal(payload.success, false);
  }
  return payload;
}

test("actual route successes preserve response shapes, rate headers and private database caching", async () => {
  for (const [handler, path, body] of cases) {
    reset();
    const response = await handler(request(path, body));
    assert.equal(response.headers.get("RateLimit-Limit"), "10");
    if (path === "database") assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const payload = await check(response, 200);
    assert.equal(payload.success, true);
    assert.equal(state.approvals, 1);
    if (path === "marks") assert.deepEqual(Object.keys(payload).sort(), ["count", "insertedCount", "message", "requestId", "success", "updatedCount"]);
    if (path === "database") assert.deepEqual(Object.keys(payload).sort(), ["data", "meta", "success"]);
    if (path === "result-publications") assert.equal(payload.event.Result_Status, "Published");
  }
});

test("actual routes preserve 401, 403, 429 and 503 precedence and request IDs", async () => {
  for (const [handler, path, body] of cases) {
    reset(); state.current = null;
    await check(await handler(request(path, body)), 401, "AUTHENTICATION_REQUIRED");
    assert.equal(state.reads, 0);
    reset("Unknown");
    await check(await handler(request(path, body)), 403, "FORBIDDEN");
    assert.equal(state.reads, 0);
    reset(); state.limit.allowed = false;
    const limited = await handler(request(path, body));
    assert.ok(Number(limited.headers.get("Retry-After")) >= 1);
    assert.equal(limited.headers.get("RateLimit-Remaining"), "9");
    await check(limited, 429, "RATE_LIMITED");
    assert.equal(state.approvals, 0);
    reset(); state.limit.configured = false;
    await check(await handler(request(path, body)), 503, "RATE_LIMIT_CONFIGURATION_ERROR");
    assert.equal(state.approvals, 0);
  }
});

test("write handlers reject origin and malformed bodies without academic reads", async () => {
  for (const [handler, path, body] of cases.slice(1)) {
    reset();
    await check(await handler(request(path, body, "https://forged.example.test")), 403, "REQUEST_ORIGIN_REJECTED");
    assert.equal(state.approvals, 0);
    reset();
    const response = await handler(request(path, "{"));
    assert.equal(response.status, 400);
    assert.equal(state.reads, 0);
  }
});

test("actual route validation, permission and storage failures retain safe response mapping", async () => {
  reset();
  const invalid = await check(await marks.POST(request("marks", { ...marksBody, records: [{ ...marksBody.records[0], Marks_Obtained: 101 }] })), 422, "MARKS_VALIDATION_FAILED");
  assert.ok(invalid.details.length);
  assert.equal(state.writes, 0);
  reset("Teacher");
  await check(await marks.POST(request("marks", marksBody)), 403, "MARKS_SCOPE_FORBIDDEN");
  assert.equal(state.writes, 0);
  for (const [handler, path, body] of cases) {
    reset(); state.readError = new Error("SECRET synthetic upstream detail");
    const payload = await check(await handler(request(path, body)), 500, { database: "DATABASE_READ_FAILED", marks: "MARKS_SAVE_FAILED", "result-publications": "RESULT_PUBLICATION_FAILED" }[path]);
    assert.doesNotMatch(JSON.stringify(payload), /SECRET/);
    assert.equal(state.writes, 0);
  }
  reset(); state.writeError = new SheetWriteError("INVALID_PUBLICATION_TRANSITION", "synthetic conflict");
  await check(await publications.POST(request("result-publications", publicationBody)), 409, "INVALID_PUBLICATION_TRANSITION");
});

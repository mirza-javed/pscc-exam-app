import { mockServerModule } from "./helpers/serverImports.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { resourceFixture } from "./helpers/resourceFixture.mjs";
let fixture, current, failure, approvals, reads, allowed, configured;
function reset() { fixture = resourceFixture(); current = fixture.current; failure = null; approvals = 0; reads = []; allowed = true; configured = true; }
mockServerModule("lib/staffAuth.js", {
  getAuthenticatedEmail: async () => "synthetic@example.test",
  getCurrentStaff: async () => { approvals++; return current; },
  findActiveStaffByTeacherId: (db, id) => db.Staff_Directory.find((s) => s.Teacher_ID === id && s.Active === "TRUE"),
  getStaffAuthorization: (staff) => fixture.context(staff),
});
mockServerModule("lib/repositories/academicRepository.js", {
  loadFreshDatabaseTabs: async (tabs) => { reads.push(tabs); if (failure) throw failure; return Object.fromEntries(tabs.map((tab) => [tab, fixture.db[tab] || []])); },
  invalidateAcademicCache: () => {},
});
const rate = await import("../lib/rateLimit.mjs");
mockServerModule("lib/rateLimit.mjs", { ...rate, checkRateLimit: async () => ({ configured, allowed, actorRef: "synthetic", limit: 120, remaining: 100, reset: Date.now() + 5000, policy: { message: "Too many requests." } }) });
const config = await import("../app/api/academic-config/route.js");
const students = await import("../app/api/students/route.js");
const analytics = await import("../app/api/analytics-data/route.js");
const { GET: marksRead } = await import("../app/api/marks/route.js");
const cases = [[config.GET, "academic-config", ""], [students.GET, "students", ""], [marksRead, "marks", ""], [analytics.GET, "analytics-data", "grade=10&section=A&academicSession=2026-27"]];
const request = (path, query) => new Request(`http://localhost:3000/api/${path}?${query}`, { headers: { "X-Request-ID": "scoped-request-123" } });
async function check(handler, path, query, status, code) {
  const response = await handler(request(path, query));
  assert.equal(response.status, status);
  assert.equal(response.headers.get("X-Request-ID"), "scoped-request-123");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.requestId, "scoped-request-123");
  assert.equal(body.success, status === 200);
  if (code) assert.equal(body.code, code);
  return { body, response };
}
test("scoped route successes carry consistent IDs, private no-store and rate headers", async () => {
  for (const [handler, path, query] of cases) {
    reset(); const { response } = await check(handler, path, query, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("RateLimit-Limit"), "120");
    assert.equal(approvals, 1); assert.equal(reads.length, 1);
  }
});
test("all read handlers enforce fresh approval, recognized roles and safe contracts", async () => {
  for (const [handler, path, query] of cases) {
    reset(); current = null;
    await check(handler, path, query, 401, "AUTHENTICATION_REQUIRED"); assert.equal(reads.length, 0);
    reset(); current = fixture.context({ ...fixture.teacher, Role: "Unknown" });
    await check(handler, path, query, 403, "FORBIDDEN"); assert.equal(reads.length, 0);
    reset(); failure = new Error("secret-backend-detail");
    const { body } = await check(handler, path, query, 500, "RESOURCE_READ_FAILED");
    assert.ok(!JSON.stringify(body).includes("secret-backend-detail"));
  }
});
test("rate/config failures stop protected reads and invalid queries have consistent contracts", async () => {
  for (const [handler, path, query] of cases) {
    reset(); allowed = false;
    const { response } = await check(handler, path, query, 429, "RATE_LIMITED");
    assert.ok(Number(response.headers.get("Retry-After")) >= 1); assert.equal(approvals, 0);
    reset(); configured = false;
    await check(handler, path, query, 503, "RATE_LIMIT_CONFIGURATION_ERROR");
    reset(); await check(handler, path, `${query}&unsupported=x`, 400, "INVALID_QUERY"); assert.equal(reads.length, 0);
  }
});
test("scope changes cannot leak a preceding administrator response", async () => {
  reset();
  assert.equal((await check(students.GET, "students", "", 200)).body.items.length, 6);
  current = fixture.context(fixture.teacher);
  assert.equal((await check(students.GET, "students", "", 200)).body.items.length, 2);
  await check(students.GET, "students", "grade=10&section=B", 403, "FORBIDDEN");
  current = null;
  await check(students.GET, "students", "", 401, "AUTHENTICATION_REQUIRED");
});

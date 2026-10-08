import { mockServerModule } from "./helpers/serverImports.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { getStaffPermissions } from "../lib/authorization.mjs";
import { createAuditEvent } from "../lib/domain/auditEvents.mjs";
import { randomUUID } from "node:crypto";
let current,
  reads = 0,
  allowed = true,
  configured = true,
  broken = false;
const event = createAuditEvent(
  {
    Actor_ID: "T1",
    Actor_Role: "admin exam",
    Request_ID: randomUUID(),
    Save_ID: "SYNTHETIC-SAVE-00001",
    Source: "marksService",
  },
  {
    Action_Type: "MARKS_SAVED_UNCHANGED",
    Resource_Type: "SAVE",
    Resource_Key: "marks",
    Outcome: "SUCCESS",
  },
  "2026-10-08T00:00:00.000Z",
);
function role(value) {
  const staff = { Teacher_ID: "T1", Role: value };
  current = {
    staff,
    permissions: getStaffPermissions(staff),
    authorizationDb: {},
  };
}
mockServerModule("lib/staffAuth.js", {
  getAuthenticatedEmail: async () => "approved@example.test",
  getCurrentStaff: async () => current,
});
const rate = await import("../lib/rateLimit.mjs");
mockServerModule("lib/rateLimit.mjs", {
  ...rate,
  checkRateLimit: async () => ({
    allowed,
    configured,
    limit: 120,
    remaining: 119,
    reset: Date.now() + 1000,
    policy: { message: "Too many requests." },
  }),
});
const repository = await import("../lib/repositories/auditRepository.js");
mockServerModule("lib/repositories/auditRepository.js", {
  ...repository,
  openAuditReader: async () => {
    reads++;
    if (broken) throw new Error("private backend secret");
    return {
      binding: "synthetic",
      rowCount: 2,
      anchor: event.Audit_ID,
      read: async () => [{ row: 2, event }],
    };
  },
});
process.env.WRITE_COORDINATION_SECRET = "synthetic-audit-cursor";
const { GET } = await import("../app/api/audit-history/route.js");
const request = (query = "") =>
  new Request("http://localhost:3000/api/audit-history?" + query, {
    headers: { "X-Request-ID": "client-controlled-123" },
  });
async function check(status, code, query = "") {
  const response = await GET(request(query)),
    payload = await response.json();
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(payload.requestId, response.headers.get("X-Request-ID"));
  assert.notEqual(payload.requestId, "client-controlled-123");
  if (code) assert.equal(payload.code, code);
  assert.doesNotMatch(JSON.stringify(payload), /private backend secret/);
  return payload;
}
test("restricted audit route authorizes exact roles before repository reads and returns safe paginated contract", async () => {
  for (const value of [
    "Principal",
    "Vice_Principal",
    "Admin_Exam",
    "In_Charge_Examination",
  ]) {
    role(value);
    const payload = await check(200);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.nextCursor, null);
    assert.equal(payload.hasMore, false);
  }
  for (const value of [
    "Teacher",
    "Class_Teacher",
    "Section_Head",
    "SuperAdmin",
  ]) {
    role(value);
    const before = reads;
    await check(403, "FORBIDDEN");
    assert.equal(reads, before);
  }
  current = null;
  const before = reads;
  await check(401, "AUTHENTICATION_REQUIRED");
  assert.equal(reads, before);
});
test("audit route validates filters, rate/config failures and hides unexpected storage details", async () => {
  role("Admin_Exam");
  await check(400, "INVALID_QUERY", "previewTeacherId=T1");
  allowed = false;
  await check(429, "RATE_LIMITED");
  allowed = true;
  configured = false;
  await check(503, "RATE_LIMIT_CONFIGURATION_ERROR");
  configured = true;
  broken = true;
  await check(500, "AUDIT_READ_FAILED");
  broken = false;
});

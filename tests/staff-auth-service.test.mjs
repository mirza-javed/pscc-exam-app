import { mockServerModule } from "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
let rows = [{ Teacher_ID: "T1", Email: "approved@example.test", Role: "Teacher", Active: "TRUE" }];
let reads = 0;
mockServerModule("lib/repositories/academicRepository.js", {
  loadAuthorizationData: async () => { reads++; return { Staff_Directory: rows, Teaching_Assignments: [] }; },
  loadStaffDirectory: async () => rows,
});
mockServerModule("auth.js", { auth: async () => ({ user: { email: " approved@example.test " } }) });
const { getCurrentStaff, getAuthenticatedEmail, getApprovedStaff } = await import("../lib/staffAuth.js");

test("actual staff adapter preserves dynamic session lookup and fresh access revocation", async () => {
  assert.equal(await getAuthenticatedEmail(), "approved@example.test");
  assert.equal((await getCurrentStaff()).staff.Teacher_ID, "T1");
  assert.ok(await getApprovedStaff("approved@example.test"));
  rows = [{ ...rows[0], Active: "FALSE" }];
  assert.equal(await getCurrentStaff("approved@example.test"), null);
  assert.equal(reads, 2);
  assert.equal(await getCurrentStaff(null), null);
  assert.equal(reads, 2);
});

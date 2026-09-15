import assert from "node:assert/strict";
import test from "node:test";
import { findApprovedStaff } from "../lib/staffApproval.mjs";

test("only a single active row matching the verified Google email is approved", () => {
  const staff = [
    { Email: "javed@gmail.com", Active: "TRUE", Role: "Teacher" },
    { Email: "admin@yahoo.com", Active: "TRUE", Role: "Principal" },
  ];
  assert.equal(findApprovedStaff(staff, "Javed@Gmail.com"), staff[0]);
  assert.equal(findApprovedStaff(staff, "admin@yahoo.com"), staff[1]);
  assert.equal(findApprovedStaff(staff, "other@gmail.com"), null);
  assert.equal(findApprovedStaff(staff, ""), null);
});

test("only Active TRUE grants access; missing, other values, and duplicates fail closed", () => {
  assert.equal(findApprovedStaff([{ Email: "a@gmail.com", Active: "FALSE" }], "a@gmail.com"), null);
  assert.equal(findApprovedStaff([{ Email: "a@gmail.com" }], "a@gmail.com"), null);
  assert.equal(findApprovedStaff([{ Email: "a@gmail.com", Active: "YES" }], "a@gmail.com"), null);
  assert.equal(findApprovedStaff([{ Email: "a@gmail.com", Status: "Active" }], "a@gmail.com"), null);
  assert.equal(findApprovedStaff([
    { Email: "a@gmail.com", Active: "TRUE" },
    { Email: "A@gmail.com", Active: "TRUE" },
  ], "a@gmail.com"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeMarksBatch,
  canReviewPaper,
  canSubmitPaper,
  getStaffPermissions,
  shouldForceDatabaseRefresh,
} from "../lib/authorization.mjs";

const assignment = {
  Teacher_ID: "T-1",
  Subject: "Physics",
  Assigned_Grade: "9",
  Assigned_Section_A: "yes",
  Assigned_Section_B: "no",
  Assigned_Section_C: "no",
};
const db = {
  Teaching_Assignments: [assignment],
  Students: [
    { Kit_No: "100", Grade: "9", Section: "A" },
    { Kit_No: "101", Grade: "9", Section: "B" },
  ],
  Marks_Log: [
    { Submission_ID: "S-1", Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
  ],
};

function permissions(role = "Teacher", extra = {}) {
  return getStaffPermissions(
    { Teacher_ID: "T-1", Role: role, ...extra },
    db
  );
}

test("allowed marks request passes server-side batch authorization", () => {
  const result = authorizeMarksBatch(permissions(), [
    { Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
  ], db);
  assert.deepEqual(result, { authorized: true, reason: null });
});

test("wrong section and wrong subject marks requests are denied", () => {
  assert.equal(
    authorizeMarksBatch(permissions(), [
      { Kit_No: "101", Exam_ID: "E-1", Subject: "Physics" },
    ], db).authorized,
    false
  );
  assert.equal(
    authorizeMarksBatch(permissions(), [
      { Kit_No: "100", Exam_ID: "E-1", Subject: "Chemistry" },
    ], db).authorized,
    false
  );
});

test("one denied record denies the complete marks batch", () => {
  const result = authorizeMarksBatch(permissions(), [
    { Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
    { Kit_No: "101", Exam_ID: "E-1", Subject: "Physics" },
  ], db);
  assert.equal(result.authorized, false);
});

test("spoofed, unknown, and mismatched marks Submission_ID requests are denied", () => {
  assert.equal(
    authorizeMarksBatch(permissions(), [
      { Submission_ID: "UNKNOWN", Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
    ], db).authorized,
    false
  );
  assert.equal(
    authorizeMarksBatch(permissions(), [
      { Submission_ID: "S-1", Kit_No: "100", Exam_ID: "E-2", Subject: "Physics" },
    ], db).authorized,
    false
  );
});

test("marks request is denied when Kit_No is duplicated in Students", () => {
  const duplicateDb = {
    ...db,
    Students: [
      ...db.Students,
      { Kit_No: "100", Grade: "9", Section: "A" },
    ],
  };
  assert.equal(
    authorizeMarksBatch(permissions(), [
      { Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
    ], duplicateDb).authorized,
    false
  );
});

test("class teacher request is allowed for another subject only in own class", () => {
  const classTeacher = permissions("Class_Teacher", {
    Class_Teacher_Of: "9",
    Section_Of: "B",
  });
  assert.equal(
    authorizeMarksBatch(classTeacher, [
      { Kit_No: "101", Exam_ID: "E-1", Subject: "Chemistry" },
    ], db).authorized,
    true
  );
});

test("paper submit request is allowed and denied by backend teaching scope", () => {
  assert.equal(canSubmitPaper(permissions(), "9", "Physics"), true);
  assert.equal(canSubmitPaper(permissions(), "9", "Chemistry"), false);
});

test("paper review request is denied to teachers and out-of-scope Section Heads", () => {
  const physicsPaper = { Grade: "9", Subject: "Physics" };
  const chemistryPaper = { Grade: "9", Subject: "Chemistry" };
  assert.equal(canReviewPaper(permissions(), physicsPaper), false);
  assert.equal(canReviewPaper(permissions("Section_Head"), physicsPaper), true);
  assert.equal(canReviewPaper(permissions("Section_Head"), chemistryPaper), false);
});

test("examination administrator request can write any marks and review any paper", () => {
  const examAdmin = permissions("Admin_Exam");
  assert.equal(
    authorizeMarksBatch(examAdmin, [
      { Kit_No: "101", Exam_ID: "E-1", Subject: "Chemistry" },
    ], db).authorized,
    true
  );
  assert.equal(canReviewPaper(examAdmin, { Grade: "12", Subject: "Biology" }), true);
});

test("refresh request is honored only for examination administrators", () => {
  assert.equal(shouldForceDatabaseRefresh(permissions("Teacher"), true), false);
  assert.equal(shouldForceDatabaseRefresh(permissions("Principal"), true), false);
  assert.equal(shouldForceDatabaseRefresh(permissions("Admin_Exam"), true), true);
  assert.equal(
    shouldForceDatabaseRefresh(permissions("In-charge Examination"), true),
    true
  );
  assert.equal(shouldForceDatabaseRefresh(permissions("Admin_Exam"), false), false);
});

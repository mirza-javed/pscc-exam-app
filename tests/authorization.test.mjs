import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadMark,
  canReviewPaper,
  canSubmitPaper,
  canWriteMark,
  getStaffPermissions,
  normalizeRole,
  ownsPaper,
  projectDatabase,
} from "../lib/authorization.mjs";

const assignments = [
  {
    Teacher_ID: "T-1",
    Subject: "Physics",
    Assigned_Grade: "9",
    Assigned_Section_A: "yes",
    Assigned_Section_B: "no",
    Assigned_Section_C: "no",
  },
];

function permissions(role = "Teacher", extra = {}) {
  return getStaffPermissions(
    { Teacher_ID: "T-1", Role: role, ...extra },
    { Teaching_Assignments: assignments }
  );
}

test("roles use exact normalized matching, never substring matching", () => {
  for (const role of [
    "Principal",
    "Vice Principal",
    "Admin_Exam",
    "In-charge Examination",
    "Section_Head",
    "Class_Teacher",
    "Teacher",
  ]) {
    assert.equal(permissions(role).recognizedRole, true, role);
  }
  assert.equal(normalizeRole("  In-charge_Examination "), "in charge examination");
  assert.equal(permissions("Assistant Principal").recognizedRole, false);
  assert.equal(permissions("Teacher Admin").recognizedRole, false);
  assert.equal(permissions("Former_Admin_Exam").recognizedRole, false);
  assert.equal(permissions("").recognizedRole, false);
});

test("global read, global marks, and global review capabilities stay distinct", () => {
  const principal = permissions("Principal");
  assert.equal(principal.canReadAllAcademicData, true);
  assert.equal(principal.canWriteAllMarks, false);
  assert.equal(principal.canReviewAllPapers, true);

  const examAdmin = permissions("Admin_Exam");
  assert.equal(examAdmin.canReadAllAcademicData, true);
  assert.equal(examAdmin.canWriteAllMarks, true);
  assert.equal(examAdmin.canReviewAllPapers, true);

  const sectionHead = permissions("Section_Head");
  assert.equal(sectionHead.canReadAllAcademicData, false);
  assert.equal(sectionHead.canReviewScopedPapers, true);
});

test("class-teacher scope requires the exact Class_Teacher role", () => {
  const fields = { Class_Teacher_Of: "9", Section_Of: "B" };
  assert.equal(permissions("Class_Teacher", fields).isClassTeacher, true);
  assert.equal(permissions("Teacher", fields).isClassTeacher, false);
});

test("teacher marks and paper actions are allowed only in assigned scope", () => {
  const teacher = permissions();
  const assignedStudent = { Kit_No: "100", Grade: "9", Section: "A" };
  const wrongSection = { Kit_No: "101", Grade: "9", Section: "B" };

  assert.equal(canWriteMark(teacher, assignedStudent, "Physics"), true);
  assert.equal(canWriteMark(teacher, assignedStudent, "Chemistry"), false);
  assert.equal(canWriteMark(teacher, wrongSection, "Physics"), false);
  assert.equal(canSubmitPaper(teacher, "9", "Physics"), true);
  assert.equal(canSubmitPaper(teacher, "9", "Chemistry"), false);
});

test("class teacher can read and write all subjects only in the assigned class", () => {
  const classTeacher = permissions("Class_Teacher", {
    Class_Teacher_Of: "9",
    Section_Of: "B",
  });
  const ownStudent = { Kit_No: "101", Grade: "9", Section: "B" };
  const otherStudent = { Kit_No: "100", Grade: "9", Section: "A" };

  assert.equal(canWriteMark(classTeacher, ownStudent, "Chemistry"), true);
  assert.equal(canReadMark(classTeacher, ownStudent, { Subject: "English" }), true);
  assert.equal(canWriteMark(classTeacher, otherStudent, "Chemistry"), false);
  assert.equal(canSubmitPaper(classTeacher, "9", "Chemistry"), false);
  assert.equal(canSubmitPaper(classTeacher, "9", "Physics"), true);
});

test("paper ownership uses Teacher_ID and legacy names only when unambiguous", () => {
  const staff = { Teacher_ID: "T-1", Full_Name: "Teacher One" };
  const directory = [staff, { Teacher_ID: "T-2", Full_Name: "Teacher Two" }];
  assert.equal(ownsPaper(staff, { Submitted_By_Teacher_ID: "T-1" }, directory), true);
  assert.equal(ownsPaper(staff, { Submitted_By_Teacher_ID: "T-2" }, directory), false);
  assert.equal(ownsPaper(staff, { Teacher_Name: "Teacher One" }, directory), true);
  assert.equal(
    ownsPaper(staff, { Teacher_Name: "Teacher One" }, [...directory, { Teacher_ID: "T-3", Full_Name: "Teacher One" }]),
    false
  );
});

test("paper review is global for approved roles and scoped for Section_Head", () => {
  const paper = { Grade: "9", Subject: "Physics" };
  assert.equal(canReviewPaper(permissions("Principal"), paper), true);
  assert.equal(canReviewPaper(permissions("Teacher"), paper), false);
  assert.equal(canReviewPaper(permissions("Section_Head"), paper), true);
  assert.equal(
    canReviewPaper(permissions("Section_Head"), { Grade: "9", Subject: "Chemistry" }),
    false
  );
});

test("database projection removes records outside teacher scope and all staff rows", () => {
  const staff = { Teacher_ID: "T-1", Full_Name: "Teacher One", Role: "Teacher" };
  const teacher = permissions();
  const db = {
    Students: [
      { Kit_No: "100", Grade: "9", Section: "A" },
      { Kit_No: "101", Grade: "9", Section: "B" },
    ],
    Staff_Directory: [staff, { Teacher_ID: "T-2", Full_Name: "Teacher Two", Active: "TRUE" }],
    Teaching_Assignments: assignments,
    Marks_Log: [
      { Submission_ID: "S-1", Kit_No: "100", Exam_ID: "E-1", Subject: "Physics" },
      { Submission_ID: "S-2", Kit_No: "100", Exam_ID: "E-1", Subject: "Chemistry" },
      { Submission_ID: "S-3", Kit_No: "101", Exam_ID: "E-1", Subject: "Physics" },
    ],
    Question_Papers_Log: [
      { Submission_ID: "P-1", Submitted_By_Teacher_ID: "T-1", Grade: "9", Subject: "Physics" },
      { Submission_ID: "P-2", Submitted_By_Teacher_ID: "T-2", Grade: "9", Subject: "Physics" },
    ],
    exam_scheme: [
      { Grade: "9", Subject: "Physics" },
      { Grade: "9", Subject: "Chemistry" },
    ],
  };
  const projected = projectDatabase(db, staff, teacher);
  assert.deepEqual(projected.Students.map((row) => row.Kit_No), ["100"]);
  assert.deepEqual(projected.Marks_Log.map((row) => row.Submission_ID), ["S-1"]);
  assert.deepEqual(projected.Question_Papers_Log.map((row) => row.Submission_ID), ["P-1"]);
  assert.equal(projected.Staff_Directory.length, 0);
  assert.deepEqual(projected.exam_scheme.map((row) => row.Subject), ["Physics"]);
});

test("ambiguous student identifiers are flagged and their marks remain hidden", () => {
  const staff = { Teacher_ID: "T-1", Full_Name: "Teacher One", Role: "Teacher" };
  const db = {
    Students: [
      { Kit_No: "100", Grade: "9", Section: "A" },
      { Kit_No: "100", Grade: "9", Section: "A" },
    ],
    Teaching_Assignments: assignments,
    Marks_Log: [{ Submission_ID: "S-1", Kit_No: "100", Subject: "Physics" }],
  };
  const projected = projectDatabase(db, staff, permissions());
  assert.equal(projected.Students.length, 2);
  assert.equal(projected.Marks_Log.length, 0);
  assert.deepEqual(projected.Authorization_Issues.duplicateKitNos, ["100"]);
});

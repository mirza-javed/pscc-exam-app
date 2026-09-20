import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadMark,
  canWriteMark,
  getStaffPermissions,
  normalizeRole,
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

test("global read and global marks capabilities stay distinct", () => {
  const principal = permissions("Principal");
  assert.equal(principal.canReadAllAcademicData, true);
  assert.equal(principal.canWriteAllMarks, false);

  const examAdmin = permissions("Admin_Exam");
  assert.equal(examAdmin.canReadAllAcademicData, true);
  assert.equal(examAdmin.canWriteAllMarks, true);

  const sectionHead = permissions("Section_Head");
  assert.equal(sectionHead.canReadAllAcademicData, false);
});

test("class-teacher scope requires the exact Class_Teacher role", () => {
  const fields = { Class_Teacher_Of: "9", Section_Of: "B" };
  assert.equal(permissions("Class_Teacher", fields).isClassTeacher, true);
  assert.equal(permissions("Teacher", fields).isClassTeacher, false);
});

test("teacher marks actions are allowed only in assigned scope", () => {
  const teacher = permissions();
  const assignedStudent = { Kit_No: "100", Grade: "9", Section: "A" };
  const wrongSection = { Kit_No: "101", Grade: "9", Section: "B" };

  assert.equal(canWriteMark(teacher, assignedStudent, "Physics"), true);
  assert.equal(canWriteMark(teacher, assignedStudent, "Chemistry"), false);
  assert.equal(canWriteMark(teacher, wrongSection, "Physics"), false);
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
});

test("database projection exposes overall class results while keeping other classes hidden", () => {
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
    Result_Publications: [
      { Publication_Event_ID: "R-1", Kit_No: "100", Result_Status: "Published" },
      { Publication_Event_ID: "R-2", Kit_No: "101", Result_Status: "Published" },
    ],
    exam_scheme: [
      { Grade: "9", Subject: "Physics" },
      { Grade: "9", Subject: "Chemistry" },
    ],
  };
  const projected = projectDatabase(db, staff, teacher);
  assert.deepEqual(projected.Students.map((row) => row.Kit_No), ["100"]);
  assert.deepEqual(projected.Marks_Log.map((row) => row.Submission_ID), ["S-1", "S-2"]);
  assert.deepEqual(projected.Result_Publications.map((row) => row.Publication_Event_ID), ["R-1"]);
  assert.equal(projected.Staff_Directory.length, 0);
  assert.deepEqual(projected.exam_scheme.map((row) => row.Subject), ["Physics", "Chemistry"]);
});

test("broader assigned-class read scope does not broaden subject-scoped writes", () => {
  const teacher = permissions();
  const assignedStudent = { Kit_No: "100", Grade: "9", Section: "A" };
  assert.equal(canReadMark(teacher, assignedStudent, { Subject: "Chemistry" }), true);
  assert.equal(canWriteMark(teacher, assignedStudent, "Chemistry"), false);
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

test("ALL-section eligibility requires read access to every authoritative section", () => {
  const db = {
    Students: [
      { Kit_No: "100", Grade: "9", Section: "A" },
      { Kit_No: "101", Grade: "9", Section: "B" },
      { Kit_No: "102", Grade: "9", Section: "C" },
    ],
    Teaching_Assignments: [],
  };
  const partialAssignments = [{
    Teacher_ID: "T-1",
    Subject: "Physics",
    Assigned_Grade: "9",
    Assigned_Section_A: "yes",
    Assigned_Section_B: "yes",
    Assigned_Section_C: "no",
  }];
  const fullAssignments = [{
    ...partialAssignments[0],
    Assigned_Section_C: "yes",
  }];
  const staff = { Teacher_ID: "T-1", Role: "Teacher" };

  const partialPermissions = getStaffPermissions(staff, { Teaching_Assignments: partialAssignments });
  const partial = projectDatabase(db, staff, partialPermissions);
  assert.equal(partial.Authorization_Scope.fullGradeRead["9"], false);
  assert.deepEqual(partial.Students.map((student) => student.Section), ["A", "B"]);

  const fullPermissions = getStaffPermissions(staff, { Teaching_Assignments: fullAssignments });
  const full = projectDatabase(db, staff, fullPermissions);
  assert.equal(full.Authorization_Scope.fullGradeRead["9"], true);
  assert.deepEqual(full.Students.map((student) => student.Section), ["A", "B", "C"]);

  const principalStaff = { Teacher_ID: "P-1", Role: "Principal" };
  const principal = projectDatabase(db, principalStaff, getStaffPermissions(principalStaff, db));
  assert.equal(principal.Authorization_Scope.fullGradeRead["9"], true);
});

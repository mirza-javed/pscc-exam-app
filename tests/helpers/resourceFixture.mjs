import { getStaffPermissions } from "../../lib/authorization.mjs";
export function resourceFixture(role = "Admin_Exam") {
  const staff = { Teacher_ID: "ADMIN", Email: "synthetic@example.test", Role: role, Active: "TRUE" };
  const teacher = { Teacher_ID: "T1", Email: "teacher@example.test", Role: "Teacher", Active: "TRUE" };
  const db = {
    Students: ["A", "B", "C"].flatMap((section, index) => [0, 1].map((n) => ({ Kit_No: String(100 + index * 10 + n), Name: `Synthetic ${section} ${n}`, Grade: "10", Section: section, Group: "Science" }))),
    Staff_Directory: [staff, teacher],
    Teaching_Assignments: [{ Teacher_ID: "T1", Assigned_Grade: "10", Subject: "English", Assigned_Section_A: "TRUE" }],
    exam_scheme: ["E1", "E2"].flatMap((examId, index) => ["English", "Mathematics"].map((subject) => ({ Exam_ID: examId, Grade: "10", Subject: subject, Max_Marks: "100", Academic_Session: "2026-27", Exam_Order: String(index + 1) }))),
    Marks_Log: [], Grading_System: [], Group_Subjects: [], Subjects_Master: [], Result_Publications: [],
  };
  db.Marks_Log = db.Students.flatMap((s, index) => db.exam_scheme.map((scheme) => ({ Kit_No: s.Kit_No, Exam_ID: scheme.Exam_ID, Subject: scheme.Subject, Submission_ID: `S-${s.Kit_No}-${scheme.Exam_ID}-${scheme.Subject}`, Marks_Obtained: String(60 + index * 5) })));
  const context = (person) => ({ staff: person, permissions: getStaffPermissions(person, db), authorizationDb: { Staff_Directory: db.Staff_Directory, Teaching_Assignments: db.Teaching_Assignments } });
  return { db, staff, teacher, context, current: context(staff) };
}

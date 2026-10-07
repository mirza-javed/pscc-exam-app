import "server-only";
import { loadFreshDatabaseTabs } from "../repositories/academicRepository.js";
import { findActiveStaffByTeacherId, getStaffAuthorization } from "../staffAuth.js";
import { normalizeValue, projectDatabase } from "../authorization.mjs";
import { getAcademicSession, ALL_EXAMS } from "../domain/identifiers.mjs";
import { buildResultKey } from "../domain/publications.mjs";
import { readResourceQuery, paginateResource } from "../resourceQuery.mjs";
import { ServiceError } from "./serviceError.mjs";

const forbidden = () => { throw new ServiceError({ status: 403, error: "You are not authorized to access this scope.", code: "FORBIDDEN" }); };
const selectFields = (rows, fields) => rows.map((row) => Object.fromEntries(fields.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])));
const schemeFields = ["Exam_ID", "Exam_Name", "Grade", "Subject", "Max_Marks", "Exam_Order", "Academic_Session", "Academic_Year", "Session", "Year"];
const gradingFields = ["Grade", "Min_Percentage", "Min Percentage", "Max_Percentage", "Max Percentage", "Remarks", "Exam_ID", "Exam_Name"];
const resourceTabs = {
  students: ["Students"],
  marks: ["Students", "Marks_Log", "exam_scheme"],
  config: ["Students", "exam_scheme", "Grading_System", "Group_Subjects", "Subjects_Master"],
  analytics: ["Students", "Marks_Log", "exam_scheme", "Grading_System", "Result_Publications"],
};
const same = (a, b) => normalizeValue(a) === normalizeValue(b);
export function createResourceReadService(dependencies = {}) {
  const read = dependencies.loadFreshDatabaseTabs || loadFreshDatabaseTabs;
  return async function getResource(resource, current, params) {
    if (!current) throw new ServiceError({ status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    if (!current.permissions.recognizedRole) forbidden();
    const query = readResourceQuery(resource, params);
    let effective = current;
    if (query.previewTeacherId) {
      if (!current.permissions.canReadAllAcademicData) forbidden();
      const staff = findActiveStaffByTeacherId(current.authorizationDb, query.previewTeacherId);
      if (!staff) throw new ServiceError({ status: 404, error: "Preview staff member not found.", code: "PREVIEW_STAFF_NOT_FOUND" });
      effective = getStaffAuthorization(staff, current.authorizationDb);
      if (!effective.permissions.recognizedRole) forbidden();
    }
    const permissions = effective.permissions;
    if (query.grade && !permissions.canReadAllAcademicData &&
        ![...permissions.classTeacherScopes, ...permissions.teachingScopes].some((s) => same(s.grade, query.grade) &&
          (!query.section || same(query.section, "ALL") || same(s.section, query.section)))) forbidden();
    const db = await read(resourceTabs[resource]);
    // Only staff and assignment tables come from authorizationDb; never overwrite fresh protected rows.
    const projected = projectDatabase({ ...db, Staff_Directory: current.authorizationDb.Staff_Directory,
      Teaching_Assignments: current.authorizationDb.Teaching_Assignments }, effective.staff, permissions);
    if (same(query.section, "ALL") && projected.Authorization_Scope.fullGradeRead[normalizeValue(query.grade)] !== true) forbidden();
    const visibleGrades = new Set(projected.Students.map((student) => normalizeValue(student.Grade)));
    const authorizationScope = { fullGradeRead: Object.fromEntries(
      Object.entries(projected.Authorization_Scope.fullGradeRead).filter(([grade]) => visibleGrades.has(grade) && (!query.grade || same(grade, query.grade)))
    ) };
    const schemes = selectFields(projected.exam_scheme, schemeFields).filter((row) => (!query.grade || same(row.Grade, query.grade)) &&
      (!query.academicSession || same(getAcademicSession(row), query.academicSession)) && (!query.examId || same(row.Exam_ID, query.examId)));
    if (query.examId && !schemes.length) throw new ServiceError({ status: 404, error: "Exam configuration not found.", code: "EXAM_NOT_FOUND" });
    const students = projected.Students.filter((row) => (!query.grade || same(row.Grade, query.grade)) &&
      (!query.section || same(query.section, "ALL") || same(row.Section, query.section)) &&
      (!query.kitNo || same(row.Kit_No || row.Student_ID, query.kitNo)) &&
      (!query.search || [row.Kit_No || row.Student_ID, row.Name || row.Full_Name].some((v) => normalizeValue(v).includes(normalizeValue(query.search)))));
    const kits = new Set(students.map((s) => normalizeValue(s.Kit_No || s.Student_ID)));
    const examIds = new Set(schemes.map((s) => normalizeValue(s.Exam_ID)));
    const marks = projected.Marks_Log.filter((row) => kits.has(normalizeValue(row.Kit_No || row.Student_ID)) &&
      (!query.examId || same(row.Exam_ID, query.examId)) && (!query.subject || same(row.Subject, query.subject)) &&
      (!(query.academicSession || resource === "analytics") || examIds.has(normalizeValue(row.Exam_ID))));
    const scope = { resource, actor: current.staff.Teacher_ID, effective: effective.staff.Teacher_ID, permissions };
    const issues = { duplicateKitNos: projected.Authorization_Issues.duplicateKitNos.filter((kit) => kits.has(normalizeValue(kit))) };
    if (resource === "students") return { ...paginateResource(students, query, scope), authorizationIssues: issues };
    if (resource === "marks") return paginateResource(marks, query, scope);
    if (resource === "config") {
      const selectors = {};
      for (const student of projected.Students) {
        const grade = String(student.Grade || "").trim();
        if (!grade || (query.grade && !same(grade, query.grade))) continue;
        selectors[grade] ||= [];
        const section = String(student.Section || "").trim();
        if (section && !selectors[grade].includes(section)) selectors[grade].push(section);
      }
      for (const sections of Object.values(selectors)) sections.sort();
      return { success: true, data: { exam_scheme: schemes, Grading_System: selectFields(projected.Grading_System, gradingFields),
        Group_Subjects: projected.Group_Subjects, Subjects_Master: projected.Subjects_Master,
        Staff_Directory: current.permissions.canReadAllAcademicData ? projectDatabase(current.authorizationDb, current.staff, current.permissions).Staff_Directory : [],
        Teaching_Assignments: projected.Teaching_Assignments, selectors,
        Preview_Assignments: current.permissions.canReadAllAcademicData ? current.authorizationDb.Teaching_Assignments : [],
        Authorization_Scope: authorizationScope } };
    }
    // Publication interpretation is keyed by Result_Key, not potentially stale
    // descriptive columns. Keep every matching event in its original source order.
    const sessions = query.examId ? [...new Set(schemes.map(getAcademicSession))] : [query.academicSession || ""];
    const resultKeys = new Set(students.flatMap((student) => sessions.map((session) => buildResultKey({
      kitNo: student.Kit_No || student.Student_ID, grade: student.Grade, section: student.Section,
      academicSession: session, selectedExam: query.examId || ALL_EXAMS,
    }))));
    const publications = projected.Result_Publications.filter((event) => kits.has(normalizeValue(event.Kit_No)) &&
      resultKeys.has(String(event.Result_Key || "").trim().toLowerCase()));
    return { success: true, data: { Students: students, Marks_Log: marks, exam_scheme: schemes,
      Grading_System: selectFields(projected.Grading_System, gradingFields), Result_Publications: publications,
      Authorization_Issues: issues, Authorization_Scope: authorizationScope } };
  };
}
export const getResource = createResourceReadService();

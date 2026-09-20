const ROLE_KEYS = Object.freeze({
  PRINCIPAL: "principal",
  VICE_PRINCIPAL: "vice principal",
  ADMIN_EXAM: "admin exam",
  IN_CHARGE_EXAMINATION: "in charge examination",
  SECTION_HEAD: "section head",
  CLASS_TEACHER: "class teacher",
  TEACHER: "teacher",
});

const RECOGNIZED_ROLES = new Set(Object.values(ROLE_KEYS));
const GLOBAL_READ_ROLES = new Set([
  ROLE_KEYS.PRINCIPAL,
  ROLE_KEYS.VICE_PRINCIPAL,
  ROLE_KEYS.ADMIN_EXAM,
  ROLE_KEYS.IN_CHARGE_EXAMINATION,
]);
const GLOBAL_MARKS_WRITE_ROLES = new Set([
  ROLE_KEYS.ADMIN_EXAM,
  ROLE_KEYS.IN_CHARGE_EXAMINATION,
]);
const EMPTY_VALUES = new Set(["", "none", "nan", "null", "-"]);
const TRUTHY_VALUES = new Set(["1", "true", "yes", "y", "t"]);

export function normalizeValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeRole(value) {
  return normalizeValue(value)
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValue(value) {
  return !EMPTY_VALUES.has(normalizeValue(value));
}

function sameValue(left, right) {
  const normalizedLeft = normalizeValue(left);
  return normalizedLeft !== "" && normalizedLeft === normalizeValue(right);
}

function scopeMatches(scope, grade, section, subject) {
  return (
    sameValue(scope.grade, grade) &&
    sameValue(scope.section, section) &&
    (subject === undefined || sameValue(scope.subject, subject))
  );
}

function uniqueScopes(scopes, includeSubject) {
  const found = new Map();
  for (const scope of scopes) {
    const parts = [normalizeValue(scope.grade), normalizeValue(scope.section)];
    if (includeSubject) parts.push(normalizeValue(scope.subject));
    const key = parts.join("\u0000");
    if (!found.has(key)) found.set(key, scope);
  }
  return Array.from(found.values());
}

function sorted(values) {
  return Array.from(values).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return String(left).localeCompare(String(right));
  });
}

export function getStaffPermissions(staff, db = {}) {
  const info = staff || {};
  const roleKey = normalizeRole(info.Role);
  const teacherId = String(info.Teacher_ID || "").trim();
  const recognizedRole = RECOGNIZED_ROLES.has(roleKey);
  const classTeacherScopes = [];
  const teachingScopes = [];

  const classGrade = String(info.Class_Teacher_Of || "").trim();
  const classSection = String(info.Section_Of || "").trim();
  if (
    roleKey === ROLE_KEYS.CLASS_TEACHER &&
    hasValue(classGrade) &&
    hasValue(classSection)
  ) {
    classTeacherScopes.push({ grade: classGrade, section: classSection });
  }

  for (const row of db.Teaching_Assignments || []) {
    if (!sameValue(row.Teacher_ID, teacherId)) continue;
    const grade = String(row.Assigned_Grade || "").trim();
    const subject = String(row.Subject || "").trim();
    if (!hasValue(grade) || !hasValue(subject)) continue;

    for (const [column, rawValue] of Object.entries(row)) {
      if (!column.startsWith("Assigned_Section_")) continue;
      if (!TRUTHY_VALUES.has(normalizeValue(rawValue))) continue;
      const section = column.slice("Assigned_Section_".length).trim();
      if (hasValue(section)) teachingScopes.push({ grade, section, subject });
    }
  }

  const uniqueClassScopes = uniqueScopes(classTeacherScopes, false);
  const uniqueTeachingScopes = uniqueScopes(teachingScopes, true);
  const grades = new Set();
  const sections = {};
  const subjects = {};

  for (const scope of [...uniqueClassScopes, ...uniqueTeachingScopes]) {
    grades.add(scope.grade);
    if (!sections[scope.grade]) sections[scope.grade] = new Set();
    sections[scope.grade].add(scope.section);
  }
  for (const scope of uniqueTeachingScopes) {
    const key = `${scope.grade}_${scope.section}`;
    if (!subjects[key]) subjects[key] = new Set();
    subjects[key].add(scope.subject);
  }

  const assignedSections = {};
  for (const [grade, values] of Object.entries(sections)) {
    assignedSections[grade] = sorted(values);
  }
  const assignedSubjects = {};
  for (const [key, values] of Object.entries(subjects)) {
    assignedSubjects[key] = sorted(values);
  }

  const canReadAllAcademicData = recognizedRole && GLOBAL_READ_ROLES.has(roleKey);
  const canWriteAllMarks = recognizedRole && GLOBAL_MARKS_WRITE_ROLES.has(roleKey);
  return {
    roleKey,
    recognizedRole,
    isAdmin: canReadAllAcademicData,
    isClassTeacher: uniqueClassScopes.length > 0,
    canReadAllAcademicData,
    canWriteAllMarks,
    canRefreshDatabase:
      roleKey === ROLE_KEYS.ADMIN_EXAM || roleKey === ROLE_KEYS.IN_CHARGE_EXAMINATION,
    classTeacherScopes: uniqueClassScopes,
    teachingScopes: uniqueTeachingScopes,
    assignedGrades: sorted(grades),
    assignedSections,
    assignedSubjects,
  };
}

export function canReadStudent(permissions, student) {
  if (!permissions?.recognizedRole || !student) return false;
  if (permissions.canReadAllAcademicData) return true;
  const grade = student.Grade;
  const section = student.Section;
  return (
    permissions.classTeacherScopes.some((scope) => scopeMatches(scope, grade, section)) ||
    permissions.teachingScopes.some((scope) => scopeMatches(scope, grade, section))
  );
}

export function canReadMark(permissions, student, mark) {
  if (!permissions?.recognizedRole || !student || !mark) return false;
  if (permissions.canReadAllAcademicData) return true;
  const grade = student.Grade;
  const section = student.Section;
  return (
    permissions.classTeacherScopes.some((scope) => scopeMatches(scope, grade, section)) ||
    permissions.teachingScopes.some((scope) => scopeMatches(scope, grade, section))
  );
}

export function canWriteMark(permissions, student, subject) {
  if (!permissions?.recognizedRole || !student || !hasValue(subject)) return false;
  if (permissions.canWriteAllMarks) return true;
  const grade = student.Grade;
  const section = student.Section;
  return (
    permissions.classTeacherScopes.some((scope) => scopeMatches(scope, grade, section)) ||
    permissions.teachingScopes.some((scope) => scopeMatches(scope, grade, section, subject))
  );
}

export function buildUniqueIndex(rows, keyName) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = normalizeValue(row?.[keyName]);
    if (!key) continue;
    const matches = grouped.get(key) || [];
    matches.push(row);
    grouped.set(key, matches);
  }
  const unique = new Map();
  const ambiguous = new Set();
  for (const [key, matches] of grouped) {
    if (matches.length === 1) unique.set(key, matches[0]);
    else ambiguous.add(key);
  }
  return { unique, ambiguous };
}

export function authorizeMarksBatch(permissions, records, db = {}) {
  const students = buildUniqueIndex(db.Students || [], "Kit_No");
  const submissions = buildUniqueIndex(db.Marks_Log || [], "Submission_ID");

  for (const record of records || []) {
    const kitKey = normalizeValue(record.Kit_No || record.Student_ID);
    const student = students.unique.get(kitKey);
    if (!student || students.ambiguous.has(kitKey)) {
      return { authorized: false, reason: "student_scope" };
    }
    if (!canWriteMark(permissions, student, record.Subject)) {
      return { authorized: false, reason: "teaching_scope" };
    }

    if (record.Submission_ID) {
      const submissionKey = normalizeValue(record.Submission_ID);
      const existing = submissions.unique.get(submissionKey);
      if (!existing || submissions.ambiguous.has(submissionKey)) {
        return { authorized: false, reason: "submission_target" };
      }
      const sameTarget =
        normalizeValue(existing.Kit_No || existing.Student_ID) === kitKey &&
        normalizeValue(existing.Exam_ID) === normalizeValue(record.Exam_ID) &&
        normalizeValue(existing.Subject) === normalizeValue(record.Subject);
      if (!sameTarget) {
        return { authorized: false, reason: "submission_mismatch" };
      }
    }
  }

  return { authorized: true, reason: null };
}

export function shouldForceDatabaseRefresh(permissions, requested) {
  return requested === true && permissions?.canRefreshDatabase === true;
}

function canReadGradeSubject(permissions, grade, subject) {
  if (permissions.canReadAllAcademicData) return true;
  if (
    permissions.classTeacherScopes.some((scope) => sameValue(scope.grade, grade))
  ) {
    return true;
  }
  return permissions.teachingScopes.some((scope) => sameValue(scope.grade, grade));
}

function sanitizeStaff(staff) {
  return {
    Teacher_ID: staff.Teacher_ID || "",
    Full_Name: staff.Full_Name || staff.Name || "",
    Teaching_Subject: staff.Teaching_Subject || "",
    Role: staff.Role || "",
    Class_Teacher_Of: staff.Class_Teacher_Of || "",
    Section_Of: staff.Section_Of || "",
  };
}

export function sanitizeCurrentStaff(staff) {
  return {
    ...sanitizeStaff(staff || {}),
    Email: staff?.Email || "",
  };
}

export function projectDatabase(db, staff, permissions) {
  const students = db.Students || [];
  const studentIndex = buildUniqueIndex(students, "Kit_No");
  const visibleStudents = permissions.canReadAllAcademicData
    ? students
    : students.filter((student) => canReadStudent(permissions, student));
  const visibleDuplicateKitNos = sorted(
    new Set(
      visibleStudents
        .filter((student) =>
          studentIndex.ambiguous.has(normalizeValue(student.Kit_No || student.Student_ID))
        )
        .map((student) => String(student.Kit_No || student.Student_ID || "").trim())
        .filter(Boolean)
    )
  );

  const visibleMarks = (db.Marks_Log || []).filter((mark) => {
    if (permissions.canReadAllAcademicData) return true;
    const student = studentIndex.unique.get(normalizeValue(mark.Kit_No || mark.Student_ID));
    return Boolean(student && canReadMark(permissions, student, mark));
  });

  const staffDirectory = db.Staff_Directory || [];

  const visibleResultPublications = (db.Result_Publications || []).filter((event) => {
    if (permissions.canReadAllAcademicData) return true;
    const student = studentIndex.unique.get(normalizeValue(event.Kit_No));
    return Boolean(student && canReadStudent(permissions, student));
  });

  const visibleAssignments = permissions.canReadAllAcademicData
    ? db.Teaching_Assignments || []
    : (db.Teaching_Assignments || []).filter((row) =>
        sameValue(row.Teacher_ID, staff.Teacher_ID)
      );

  const visibleExamScheme = (db.exam_scheme || []).filter((row) =>
    canReadGradeSubject(permissions, row.Grade, row.Subject)
  );
  const visibleSubjects = (db.Subjects_Master || []).filter((row) =>
    canReadGradeSubject(
      permissions,
      row.Applicable_Grade || row.Grade,
      row.Subject_Name || row.Subject
    )
  );

  const authoritativeStudentsByGrade = new Map();
  for (const student of students) {
    const gradeKey = normalizeValue(student.Grade);
    if (!gradeKey) continue;
    const gradeStudents = authoritativeStudentsByGrade.get(gradeKey) || [];
    gradeStudents.push(student);
    authoritativeStudentsByGrade.set(gradeKey, gradeStudents);
  }
  const fullGradeRead = {};
  for (const [gradeKey, gradeStudents] of authoritativeStudentsByGrade) {
    const visibleSections = new Set(
      gradeStudents
        .filter((student) => canReadStudent(permissions, student))
        .map((student) => normalizeValue(student.Section))
        .filter(Boolean)
    );
    const authoritativeSections = new Set(
      gradeStudents.map((student) => normalizeValue(student.Section)).filter(Boolean)
    );
    fullGradeRead[gradeKey] = authoritativeSections.size > 1 &&
      authoritativeSections.size === visibleSections.size &&
      Array.from(authoritativeSections).every((section) => visibleSections.has(section));
  }

  return {
    Students: visibleStudents,
    Staff_Directory: permissions.canReadAllAcademicData
      ? staffDirectory.filter((row) => normalizeValue(row.Active) === "true").map(sanitizeStaff)
      : [],
    Teaching_Assignments: visibleAssignments,
    Grading_System: db.Grading_System || [],
    exam_scheme: visibleExamScheme,
    Marks_Log: visibleMarks,
    Group_Subjects: db.Group_Subjects || [],
    Subjects_Master: visibleSubjects,
    Result_Publications: visibleResultPublications,
    Authorization_Issues: {
      duplicateKitNos: visibleDuplicateKitNos,
    },
    Authorization_Scope: {
      fullGradeRead,
    },
    _cached: db._cached || false,
    _cachedAt: db._cachedAt || null,
  };
}

export { ROLE_KEYS };

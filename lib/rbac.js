/**
 * Extracts and computes Role-Based Access Control (RBAC) permissions for a staff member.
 */
export function getStaffPermissions(userInfo, db = {}) {
  const info = userInfo || {};
  const role = String(info.Role || "").trim().toLowerCase();
  const responsibility = String(info.Responsibility || "").trim().toLowerCase();
  const teacherId = String(info.Teacher_ID || "").trim();

  const adminKeywords = [
    "principal", "v. principal", "v_principal", "vice principal",
    "section_head", "section head", "admin_exam", "admin exam",
    "in-charge_exam", "in-charge examination", "examination incharge",
    "incharge examination", "in-charge exam", "admin", "administrator",
  ];

  const isAdmin = adminKeywords.some((k) => role.includes(k) || responsibility.includes(k));

  if (isAdmin) {
    return {
      isAdmin: true,
      isClassTeacher: false,
      classTeacherScopes: [],
      assignedGrades: [],
      assignedSections: {},
      assignedSubjects: {},
    };
  }

  const assignedGradesSet = new Set();
  const assignedSectionsMap = {}; // grade -> Set(sections)
  const assignedSubjectsMap = {}; // "grade_section" -> Set(subjects)
  const classTeacherScopes = [];  // Array of { grade, section }

  // Check Class_Teacher_Of / Section_Of
  const classTeacherOf = String(info.Class_Teacher_Of || info.Class_Incharge_Of || "").trim();
  const sectionOf = String(info.Section_Of || "").trim();

  if (
    classTeacherOf &&
    !["none", "", "nan", "null"].includes(classTeacherOf.toLowerCase()) &&
    sectionOf &&
    !["none", "", "nan", "null"].includes(sectionOf.toLowerCase())
  ) {
    assignedGradesSet.add(classTeacherOf);
    if (!assignedSectionsMap[classTeacherOf]) {
      assignedSectionsMap[classTeacherOf] = new Set();
    }
    assignedSectionsMap[classTeacherOf].add(sectionOf);
    classTeacherScopes.push({ grade: classTeacherOf, section: sectionOf });
  }

  // Parse Teaching_Assignments table
  const assignments = db.Teaching_Assignments || [];
  const truthyValues = new Set(["1", "true", "yes", "y", "t"]);

  if (assignments.length > 0 && teacherId) {
    const userAssignments = assignments.filter(
      (r) => String(r.Teacher_ID || "").trim() === teacherId
    );

    userAssignments.forEach((row) => {
      const grade = String(row.Assigned_Grade || row.Grade || "").trim();
      const subject = String(row.Subject || row.Subject_Name || "").trim();
      if (!grade || !subject) return;

      // Check section flag columns: Assigned_Section_A, Assigned_Section_B, etc.
      const sectionFlagCols = Object.keys(row).filter(
        (col) =>
          col.startsWith("Assigned_Section_") ||
          (col.startsWith("Section_") && col !== "Section_Name")
      );

      if (sectionFlagCols.length > 0) {
        sectionFlagCols.forEach((flagCol) => {
          const val = String(row[flagCol] || "").trim().toLowerCase();
          if (truthyValues.has(val)) {
            const secName = flagCol.startsWith("Assigned_Section_")
              ? flagCol.substring("Assigned_Section_".length).trim()
              : flagCol.substring("Section_".length).trim();

            if (secName) {
              assignedGradesSet.add(grade);
              if (!assignedSectionsMap[grade]) assignedSectionsMap[grade] = new Set();
              assignedSectionsMap[grade].add(secName);

              const key = `${grade}_${secName}`;
              if (!assignedSubjectsMap[key]) assignedSubjectsMap[key] = new Set();
              assignedSubjectsMap[key].add(subject);
            }
          }
        });
      } else {
        const section = String(row.Assigned_Section || row.Section || "").trim();
        if (section) {
          assignedGradesSet.add(grade);
          if (!assignedSectionsMap[grade]) assignedSectionsMap[grade] = new Set();
          assignedSectionsMap[grade].add(section);

          const key = `${grade}_${section}`;
          if (!assignedSubjectsMap[key]) assignedSubjectsMap[key] = new Set();
          assignedSubjectsMap[key].add(subject);
        }
      }
    });
  }

  // Convert Sets to Arrays
  const assignedGrades = Array.from(assignedGradesSet).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  });

  const assignedSections = {};
  Object.keys(assignedSectionsMap).forEach((g) => {
    assignedSections[g] = Array.from(assignedSectionsMap[g]).sort();
  });

  const assignedSubjects = {};
  Object.keys(assignedSubjectsMap).forEach((k) => {
    assignedSubjects[k] = Array.from(assignedSubjectsMap[k]).sort();
  });

  return {
    isAdmin: false,
    isClassTeacher: classTeacherScopes.length > 0,
    classTeacherScopes,
    assignedGrades,
    assignedSections,
    assignedSubjects,
  };
}

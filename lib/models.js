import { isSubjectApplicableToCadet } from "./academicRules.mjs";

export { isSubjectApplicableToCadet } from "./academicRules.mjs";

/**
 * Subject & Group filtering utilities mirroring PSCC academic rules.
 */

export function getAllAvailableSubjects(db = {}) {
  const subjects = new Set();

  const gs = db.Group_Subjects || [];
  gs.forEach((row) => {
    Object.values(row).forEach((val) => {
      const s = String(val || "").trim();
      if (s && !s.startsWith("Subjects_of_")) {
        subjects.add(s);
      }
    });
  });

  const es = db.exam_scheme || [];
  es.forEach((row) => {
    const s = String(row.Subject || "").trim();
    if (s) subjects.add(s);
  });

  const ta = db.Teaching_Assignments || [];
  ta.forEach((row) => {
    const s = String(row.Subject || row.Subject_Name || "").trim();
    if (s) subjects.add(s);
  });

  const sm = db.Subjects_Master || [];
  sm.forEach((row) => {
    const s = String(row.Subject_Name || row.Subject || "").trim();
    if (s) subjects.add(s);
  });

  const result = sortSubjectsWithConductLast(Array.from(subjects).sort());
  return result.length > 0
    ? result
    : [
        "English",
        "Urdu",
        "Maths",
        "Physics",
        "Chemistry",
        "Islamiat",
        "Biology",
        "Computer Science",
        "Pakistan Studies",
        "Sindhi",
      ];
}

export function getSubjectsForGrade(db = {}, grade) {
  const es = db.exam_scheme || [];
  if (es.length > 0 && grade) {
    const matched = es
      .filter((r) => String(r.Grade || "").trim() === String(grade).trim())
      .map((r) => String(r.Subject || "").trim())
      .filter(Boolean);

    const unique = sortSubjectsWithConductLast(Array.from(new Set(matched)).sort());
    if (unique.length > 0) return unique;
  }
  return getAllAvailableSubjects(db);
}

/**
 * Ensures any subject named or containing "Conduct" (case-insensitive) is moved
 * to the very end of the subject list regardless of alphabetical order.
 */
export function sortSubjectsWithConductLast(subjects = []) {
  if (!Array.isArray(subjects) || subjects.length === 0) return [];
  const nonConduct = [];
  const conduct = [];
  subjects.forEach((s) => {
    const name = typeof s === "string" ? s : (s?.Subject || s?.Subject_Name || s?.name || "");
    if (String(name).trim().toLowerCase().includes("conduct")) {
      conduct.push(s);
    } else {
      nonConduct.push(s);
    }
  });
  return [...nonConduct, ...conduct];
}

/**
 * Filters an array of subjects to only those applicable to the given cadet,
 * ensuring "Conduct" is always placed at the very end of the subject list.
 */
export function filterSubjectsForCadet(subjects = [], cadet, grade) {
  if (!Array.isArray(subjects) || subjects.length === 0) return [];
  const filtered = !cadet
    ? [...subjects]
    : subjects.filter((subj) => isSubjectApplicableToCadet(subj, cadet, grade));
  return sortSubjectsWithConductLast(filtered);
}

export function filterStudentsBySubjectGroup(students = [], grade, subject) {
  if (!Array.isArray(students) || students.length === 0) return [];
  if (!grade || !subject) return students;

  return students.filter((std) => isSubjectApplicableToCadet(subject, std, grade));
}

export function resolveMaxMarks(examNameOrId, grade, subject, db = {}) {
  const scheme = db.exam_scheme || [];
  const matches = scheme.filter((row) =>
    String(row.Exam_ID || "").trim().toLowerCase() === String(examNameOrId || "").trim().toLowerCase() &&
    String(row.Grade || "").trim().toLowerCase() === String(grade || "").trim().toLowerCase() &&
    String(row.Subject || "").trim().toLowerCase() === String(subject || "").trim().toLowerCase()
  );
  if (matches.length !== 1) return null;
  const raw = String(matches[0].Max_Marks ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const maximum = Number(raw);
  return Number.isFinite(maximum) && maximum > 0 ? maximum : null;
}

/**
 * Automatically deduces Total Marks and Time Allowed from the exam_scheme Google sheet
 * based on selected Grade, Subject, and Exam Name.
 */
export function resolveExamSchemeSpecs(examNameOrId, grade, subject, db = {}) {
  const scheme = db.exam_scheme || [];
  if (!scheme || scheme.length === 0) {
    return { totalMarks: "100", timeAllowed: "3 Hours", found: false };
  }

  const cleanGrade = String(grade || "").trim();
  const cleanSubject = String(subject || "").trim().toLowerCase();
  const cleanExam = String(examNameOrId || "").trim().toLowerCase();

  // 1. Exact match: Grade + Subject + Exam (Exam_ID or Exam_Name)
  let match = scheme.find((r) => {
    const gMatch = String(r.Grade || "").trim() === cleanGrade;
    const sMatch = String(r.Subject || "").trim().toLowerCase() === cleanSubject;
    const eMatch =
      String(r.Exam_ID || "").trim().toLowerCase() === cleanExam ||
      String(r.Exam_Name || "").trim().toLowerCase() === cleanExam;
    return gMatch && sMatch && eMatch;
  });

  // 2. Fallback: Grade + Subject match
  if (!match) {
    match = scheme.find((r) => {
      const gMatch = String(r.Grade || "").trim() === cleanGrade;
      const sMatch = String(r.Subject || "").trim().toLowerCase() === cleanSubject;
      return gMatch && sMatch;
    });
  }

  // 3. Fallback: Exam + Subject match
  if (!match && cleanExam) {
    match = scheme.find((r) => {
      const sMatch = String(r.Subject || "").trim().toLowerCase() === cleanSubject;
      const eMatch =
        String(r.Exam_ID || "").trim().toLowerCase() === cleanExam ||
        String(r.Exam_Name || "").trim().toLowerCase() === cleanExam;
      return sMatch && eMatch;
    });
  }

  // 4. Fallback: Subject-only match
  if (!match) {
    match = scheme.find((r) => {
      return String(r.Subject || "").trim().toLowerCase() === cleanSubject;
    });
  }

  if (!match) {
    return { totalMarks: "100", timeAllowed: "3 Hours", found: false };
  }

  // Resolve Max / Total Marks
  let rawMarks = match.Max_Marks ?? match.Total_Marks ?? match.Marks ?? match.max_marks ?? match.total_marks;
  let resolvedMarks = "100";
  if (rawMarks !== undefined && rawMarks !== null && String(rawMarks).trim() !== "") {
    const num = parseFloat(String(rawMarks).replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) {
      resolvedMarks = String(num);
    }
  }

  // Resolve Time Allowed / Duration
  let rawTime =
    match.Time_Allowed ??
    match.Time ??
    match.Duration ??
    match.Time_Limit ??
    match.Hours ??
    match.Exam_Time ??
    match.time_allowed;

  let resolvedTime = "";
  if (rawTime !== undefined && rawTime !== null && String(rawTime).trim() !== "") {
    const str = String(rawTime).trim();
    if (/^\d+(\.\d+)?$/.test(str)) {
      const val = parseFloat(str);
      if (val <= 6) {
        resolvedTime = `${val} Hours`;
      } else {
        resolvedTime = `${val} Minutes`;
      }
    } else {
      resolvedTime = str;
    }
  }

  // If time allowed is not explicitly specified in the row, deduce intelligently from marks & exam
  if (!resolvedTime) {
    const marksNum = parseFloat(resolvedMarks);
    if (cleanExam.includes("monthly") || cleanExam.includes("test") || marksNum <= 25) {
      resolvedTime = "1 Hour";
    } else if (marksNum <= 50) {
      resolvedTime = "2 Hours";
    } else if (marksNum <= 75) {
      resolvedTime = "2.5 Hours";
    } else {
      resolvedTime = "3 Hours";
    }
  }

  return {
    totalMarks: resolvedMarks,
    timeAllowed: resolvedTime,
    found: true,
    matchedScheme: match,
  };
}

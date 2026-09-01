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

  const result = Array.from(subjects).sort();
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

    const unique = Array.from(new Set(matched)).sort();
    if (unique.length > 0) return unique;
  }
  return getAllAvailableSubjects(db);
}

export function filterStudentsBySubjectGroup(students = [], grade, subject) {
  if (!Array.isArray(students) || students.length === 0) return [];
  if (!grade || !subject) return students;

  const SUBJECT_GROUP_EXCLUSIONS = {
    "9-10": {
      biology: ["cs", "computer science", "computer"],
      "computer science": ["bio", "biology"],
      computer: ["bio", "biology"],
    },
    "11-12": {
      mathematics: ["pm", "pre-medical", "medical"],
      maths: ["pm", "pre-medical", "medical"],
      "computer science": ["pm", "pe", "pre-medical", "pre-engineering"],
      computer: ["pm", "pe", "pre-medical", "pre-engineering"],
      botany: ["pe", "gs", "pre-engineering", "general science"],
      zoology: ["pe", "gs", "pre-engineering", "general science"],
      chemistry: ["gs", "general science"],
    },
  };

  const gradeNum = parseInt(String(grade).trim(), 10);
  if (isNaN(gradeNum)) return students;

  let matchedRules = null;
  if (gradeNum >= 9 && gradeNum <= 10) {
    matchedRules = SUBJECT_GROUP_EXCLUSIONS["9-10"];
  } else if (gradeNum >= 11 && gradeNum <= 12) {
    matchedRules = SUBJECT_GROUP_EXCLUSIONS["11-12"];
  }

  if (!matchedRules) return students;

  const subjKey = String(subject).trim().toLowerCase();
  const excludedGroups = matchedRules[subjKey];
  if (!excludedGroups) return students;

  return students.filter((std) => {
    const groupVal = String(std.Group || std.Stream || "").trim().toLowerCase();
    if (!groupVal) return true;
    return !excludedGroups.some((ex) => groupVal.includes(ex));
  });
}

export function resolveMaxMarks(examNameOrId, grade, subject, db = {}) {
  const scheme = db.exam_scheme || [];
  if (scheme.length > 0) {
    const match = scheme.find((r) => {
      const gMatch = String(r.Grade || "").trim() === String(grade || "").trim();
      const sMatch = String(r.Subject || "").trim().toLowerCase() === String(subject || "").trim().toLowerCase();
      const eMatch =
        String(r.Exam_ID || "").trim() === String(examNameOrId || "").trim() ||
        String(r.Exam_Name || "").trim() === String(examNameOrId || "").trim();

      return gMatch && sMatch && (eMatch || !examNameOrId);
    });

    if (match && match.Max_Marks) {
      const num = parseFloat(String(match.Max_Marks).replace(/[^0-9.]/g, ""));
      if (!isNaN(num) && num > 0) return num;
    }
  }

  return 100;
}

import { matchesScheme } from "./domain/schemeMatching.mjs";
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

    const unique = sortSubjectsWithConductLast(
      Array.from(new Set(matched)).sort(),
    );
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
    const name =
      typeof s === "string"
        ? s
        : s?.Subject || s?.Subject_Name || s?.name || "";
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

  return students.filter((std) =>
    isSubjectApplicableToCadet(subject, std, grade),
  );
}

export function resolveMaxMarks(examNameOrId, grade, subject, db = {}) {
  const scheme = db.exam_scheme || [];
  const matches = scheme.filter((row) =>
    matchesScheme(row, examNameOrId, grade, subject, (value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    ),
  );
  if (matches.length !== 1) return null;
  const raw = String(matches[0].Max_Marks ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const maximum = Number(raw);
  return Number.isFinite(maximum) && maximum > 0 ? maximum : null;
}

import { normalizeValue } from "./identifiers.mjs";
/** Exact matching only. Callers retain duplicate/maximum checks and errors. */
export function matchesScheme(row, examId, grade, subject, key = normalizeValue) {
  return key(row.Exam_ID) === key(examId) && key(row.Grade) === key(grade) && key(row.Subject) === key(subject);
}

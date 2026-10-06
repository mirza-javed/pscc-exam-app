/** Comparison keys never replace stored/display identifiers. Variants preserve legacy behavior. */
export function normalizeValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeWriteKey(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

export const ALL_EXAMS = "All Exams";
export const ALL_SECTIONS = "ALL";

export function getAcademicSession(row) {
  return String(row?.Academic_Session ?? row?.Academic_Year ?? row?.Session ?? row?.Year ?? "").trim();
}

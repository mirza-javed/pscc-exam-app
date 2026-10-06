export const MARK_STATES = Object.freeze({ PRESENT: "PRESENT", ABSENT: "ABSENT", MISSING: "MISSING", INVALID: "INVALID", NOT_APPLICABLE: "NOT_APPLICABLE", DUPLICATE_CONFLICT: "DUPLICATE_CONFLICT", CONFIGURATION_ERROR: "CONFIGURATION_ERROR", COMPLETE: "COMPLETE" });
export const ABSENCE_VALUES = Object.freeze(["ab", "a", "absent", "a/b", "n/a", "na", "-"]);
const ABSENCE_SET = new Set(ABSENCE_VALUES);
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const text = (value) => String(value ?? "").trim();
export function isLegacyAbsent(value) { return ABSENCE_SET.has(text(value).toLowerCase()); }
export function parseStrictNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!DECIMAL_PATTERN.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function normalizeMarkValue(value) {
  const raw = text(value);
  if (!raw) return { state: MARK_STATES.MISSING, value: null, identity: "MISSING" };
  if (ABSENCE_SET.has(raw.toLowerCase())) return { state: MARK_STATES.ABSENT, value: 0, identity: "ABSENT" };
  const number = parseStrictNumber(value);
  if (number === null || number < 0) return { state: MARK_STATES.INVALID, value: null, identity: `INVALID:${raw}` };
  return { state: MARK_STATES.PRESENT, value: number, identity: `PRESENT:${number}` };
}

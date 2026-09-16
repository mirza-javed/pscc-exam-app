const FORMULA_PREFIX_PATTERN = /^[\s\u0000-\u001f\u007f]*[=+\-@]/u;

export function isSpreadsheetFormulaLike(value) {
  return FORMULA_PREFIX_PATTERN.test(String(value ?? ""));
}

export function normalizeRequiredText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

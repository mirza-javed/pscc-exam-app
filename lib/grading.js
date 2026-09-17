const STANDARD_GRADING_SCALE = Object.freeze([
  { min: 95, max: 100, grade: "A++", remarks: "Exceptional" },
  { min: 90, max: 94.999999, grade: "A+", remarks: "Outstanding" },
  { min: 85, max: 89.999999, grade: "A", remarks: "Excellent" },
  { min: 80, max: 84.999999, grade: "B++", remarks: "Very Good" },
  { min: 75, max: 79.999999, grade: "B+", remarks: "Good" },
  { min: 70, max: 74.999999, grade: "B", remarks: "Fairly Good" },
  { min: 60, max: 69.999999, grade: "C", remarks: "Above Average" },
  { min: 50, max: 59.999999, grade: "D", remarks: "Average" },
  { min: 40, max: 49.999999, grade: "E", remarks: "Below Average" },
  { min: 0, max: 39.999999, grade: "U", remarks: "Fail / Unsatisfactory" },
]);

function parseBoundary(value) {
  const raw = String(value ?? "").trim().replace(/%$/, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function configuredScale(gradingSystem) {
  if (!Array.isArray(gradingSystem) || gradingSystem.length === 0) return null;
  const rows = gradingSystem.map((row) => ({
    min: parseBoundary(row.Min_Percentage ?? row["Min Percentage"]),
    max: parseBoundary(row.Max_Percentage ?? row["Max Percentage"]),
    grade: String(row.Grade ?? "").trim(),
    remarks: String(row.Remarks ?? "").trim() || "Satisfactory",
  }));
  if (rows.some((row) => row.min === null || row.max === null || row.min > row.max || !row.grade)) {
    return { valid: false, rows: [], error: "The configured grading scale contains invalid boundaries." };
  }
  rows.sort((left, right) => right.min - left.min || right.max - left.max || left.grade.localeCompare(right.grade));
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].max >= rows[index - 1].min) {
      return { valid: false, rows: [], error: "The configured grading scale contains overlapping boundaries." };
    }
  }
  return { valid: true, rows, error: null };
}

export function getGradingScale(gradingSystem = []) {
  return configuredScale(gradingSystem) || { valid: true, rows: STANDARD_GRADING_SCALE, error: null };
}

export function calculateGradeInfo(pct, gradingSystem = []) {
  const percentage = Math.round(Number(pct) * 100) / 100;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return { grade: "N/A", remarks: "-", status: "-", valid: false };
  }
  const scale = getGradingScale(gradingSystem);
  if (!scale.valid) {
    return { grade: "N/A", remarks: scale.error, status: "-", valid: false };
  }
  const match = scale.rows.find((row) => percentage >= row.min && percentage <= row.max);
  if (!match) {
    return {
      grade: "N/A",
      remarks: "The configured grading scale does not cover this percentage.",
      status: "-",
      valid: false,
    };
  }
  const gradeKey = match.grade.toUpperCase();
  const isFail = ["F", "FAIL", "U"].includes(gradeKey) || percentage < 40;
  return {
    grade: match.grade,
    remarks: match.remarks,
    status: isFail ? "FAIL" : "PASS",
    valid: true,
  };
}

export { STANDARD_GRADING_SCALE };

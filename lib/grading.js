/**
 * Computes letter grade, remarks, and pass/fail status from percentage.
 */
export function calculateGradeInfo(pct, gradingSystem = []) {
  const percentage = Math.round(Number(pct) * 100) / 100;
  if (isNaN(percentage)) {
    return { grade: "N/A", remarks: "-", status: "-" };
  }

  // Check custom grading system table if provided
  if (Array.isArray(gradingSystem) && gradingSystem.length > 0) {
    for (const row of gradingSystem) {
      const minStr = String(row.Min_Percentage || row["Min Percentage"] || "").replace("%", "");
      const maxStr = String(row.Max_Percentage || row["Max Percentage"] || "").replace("%", "");
      const minVal = parseFloat(minStr);
      const maxVal = parseFloat(maxStr);

      if (!isNaN(minVal) && !isNaN(maxVal)) {
        if (percentage >= minVal && percentage <= maxVal) {
          const grade = String(row.Grade || "").trim() || "N/A";
          const remarks = String(row.Remarks || "").trim() || "Satisfactory";
          const isFail = ["F", "FAIL", "Fail", "U"].includes(grade) || percentage < 40;
          return {
            grade,
            remarks,
            status: isFail ? "FAIL" : "PASS",
          };
        }
      }
    }
  }

  // Standard PS Cadet College Fallback Thresholds
  if (percentage >= 95) return { grade: "A++", remarks: "Exceptional", status: "PASS" };
  if (percentage >= 90) return { grade: "A+", remarks: "Outstanding", status: "PASS" };
  if (percentage >= 85) return { grade: "A", remarks: "Excellent", status: "PASS" };
  if (percentage >= 80) return { grade: "B++", remarks: "Very Good", status: "PASS" };
  if (percentage >= 75) return { grade: "B+", remarks: "Good", status: "PASS" };
  if (percentage >= 70) return { grade: "B", remarks: "Fairly Good", status: "PASS" };
  if (percentage >= 60) return { grade: "C", remarks: "Above Average", status: "PASS" };
  if (percentage >= 50) return { grade: "D", remarks: "Average", status: "PASS" };
  if (percentage >= 40) return { grade: "E", remarks: "Below Average", status: "PASS" };
  return { grade: "U", remarks: "Fail / Unsatisfactory", status: "FAIL" };
}

import { getAssessment } from "./examinationResults.mjs";

export function formatAssessment(assessment) {
  if (!assessment) {
    return { state: "MISSING", maximum: "-", obtained: "-", percentage: "-", grade: "-", remarks: "Not available", isFail: false };
  }
  if (assessment.state === "ABSENT") {
    return {
      state: assessment.state,
      maximum: assessment.maxMarks,
      obtained: "ABSENT",
      percentage: "AB",
      grade: "AB",
      remarks: "Absent from Exam",
      isFail: true,
    };
  }
  if (assessment.state !== "PRESENT") {
    return {
      state: assessment.state,
      maximum: assessment.maxMarks ?? "-",
      obtained: assessment.state,
      percentage: "-",
      grade: "-",
      remarks: assessment.message || assessment.state,
      isFail: false,
    };
  }
  const percentage = Math.round(assessment.pct * 10) / 10;
  return {
    state: assessment.state,
    maximum: assessment.maxMarks,
    obtained: assessment.obtained,
    percentage: `${percentage}%`,
    grade: assessment.gradeInfo?.grade || "-",
    remarks: assessment.gradeInfo?.remarks || "-",
    isFail: assessment.pct < 40,
  };
}

export function buildResultRows(result, assessmentColumns = []) {
  return assessmentColumns.map((column) => ({
    key: column.key,
    examId: column.examId,
    examName: column.examName,
    subject: column.subject,
    ...formatAssessment(getAssessment(result, column)),
  })).filter((row) => row.state !== "MISSING" || result?.assessments?.[row.examId]?.[row.subject]);
}

export function buildResultSummary(result) {
  return {
    total: result?.isFinal ? `${result.totalObtained} / ${result.totalMaxMarks}` : "-",
    percentage: result?.isFinal ? `${result.aggregatePct}%` : "-",
    grade: result?.letterGrade || "-",
    rank: result?.meritRank ? `#${result.meritRank}` : "-",
    status: result?.resultStatus || "-",
  };
}

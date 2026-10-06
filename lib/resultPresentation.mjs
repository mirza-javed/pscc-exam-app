import { MARK_STATES } from "./domain/markValues.mjs";
import { getAssessment, getExamTotal, getSubjectTotal } from "./examinationResults.mjs";

export function formatResultStatus(status) {
  return status === MARK_STATES.CONFIGURATION_ERROR ? "CONFIGURATION ERROR" : (status || "");
}

export function formatAssessmentFraction(assessment) {
  if (!assessment) return { state: MARK_STATES.NOT_APPLICABLE, display: "N/A" };
  if (assessment.state === MARK_STATES.PRESENT) {
    return { state: assessment.state, display: `${assessment.obtained}/${assessment.maxMarks}` };
  }
  if (assessment.state === MARK_STATES.ABSENT) {
    return { state: assessment.state, display: `AB/${assessment.maxMarks}` };
  }
  if (assessment.state === MARK_STATES.DUPLICATE_CONFLICT) {
    return { state: assessment.state, display: "DUPLICATE CONFLICT" };
  }
  if (assessment.state === MARK_STATES.CONFIGURATION_ERROR) {
    return { state: assessment.state, display: "CONFIG ERROR" };
  }
  return { state: assessment.state, display: assessment.state || MARK_STATES.INVALID };
}

export function formatAggregateFraction(aggregate) {
  if (!aggregate || aggregate.state === MARK_STATES.NOT_APPLICABLE) {
    return { state: MARK_STATES.NOT_APPLICABLE, display: "N/A" };
  }
  if (aggregate.state === MARK_STATES.COMPLETE) {
    return { state: aggregate.state, display: `${aggregate.obtained}/${aggregate.maxMarks}` };
  }
  if (aggregate.state === MARK_STATES.CONFIGURATION_ERROR) {
    return { state: aggregate.state, display: "CONFIG ERROR" };
  }
  return { state: aggregate.state, display: aggregate.state };
}

export function formatAssessment(assessment) {
  if (!assessment) {
    return { state: MARK_STATES.MISSING, maximum: "-", obtained: "-", percentage: "-", grade: "-", remarks: "Not available", isFail: false };
  }
  if (assessment.state === MARK_STATES.ABSENT) {
    return {
      state: assessment.state,
      maximum: assessment.maxMarks,
      obtained: MARK_STATES.ABSENT,
      percentage: "AB",
      grade: "AB",
      remarks: "Absent from Exam",
      isFail: true,
    };
  }
  if (assessment.state !== MARK_STATES.PRESENT) {
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
  })).filter((row) => row.state !== MARK_STATES.MISSING || result?.assessments?.[row.examId]?.[row.subject]);
}

/** @param {import("./contracts.mjs").ResolvedStudentResult} result
 * @returns {import("./contracts.mjs").ResultSummary} */
export function buildResultSummary(result) {
  return {
    total: result?.isFinal ? `${result.totalObtained} / ${result.totalMaxMarks}` : "-",
    percentage: result?.isFinal ? `${result.aggregatePct}%` : "-",
    grade: result?.letterGrade || "-",
    rank: result?.meritRank ? `#${result.meritRank}` : "-",
    status: result?.resultStatus || "-",
  };
}

/** @returns {import("./contracts.mjs").IndividualAllExamsModel} */
export function buildIndividualAllExamsModel(result, examColumns = [], subjectColumns = []) {
  const rows = subjectColumns.map((column) => ({
    key: column.key,
    subject: column.subject,
    examCells: examColumns.map((exam) => ({
      examId: exam.examId,
      ...formatAssessmentFraction(result?.assessments?.[exam.examId]?.[column.subject] || null),
    })),
    subjectTotal: formatAggregateFraction(getSubjectTotal(result, column.subject)),
    overallPercentage: "",
    overallGrade: "",
  }));

  return {
    examColumns,
    subjectColumns,
    rows,
    aggregateRow: {
      subject: "Grand Total / Aggregate",
      examCells: examColumns.map((exam) => ({
        examId: exam.examId,
        ...formatAggregateFraction(getExamTotal(result, exam.examId)),
      })),
      grandTotal: result?.isFinal ? `${result.totalObtained}/${result.totalMaxMarks}` : "",
      overallPercentage: result?.isFinal ? `${result.aggregatePct}%` : "",
      overallGrade: result?.letterGrade || "",
      resultStatus: formatResultStatus(result?.resultStatus),
    },
  };
}

/** @returns {import("./contracts.mjs").CombinedAllExamsModel} */
export function buildCombinedAllExamsModel(results = [], subjectColumns = []) {
  return {
    subjectColumns,
    rows: results.map((result) => ({
      kitNo: result.Kit_No,
      rank: result.meritRank || "",
      name: result.Name,
      section: result.Section,
      subjectCells: subjectColumns.map((column) => ({
        subject: column.subject,
        ...formatAggregateFraction(getSubjectTotal(result, column.subject)),
      })),
      grandTotal: result.isFinal ? `${result.totalObtained}/${result.totalMaxMarks}` : "",
      overallPercentage: result.isFinal ? `${result.aggregatePct}%` : "",
      combinedGrade: result.letterGrade || "",
      resultStatus: formatResultStatus(result.resultStatus),
    })),
  };
}

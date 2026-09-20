import { calculateGradeInfo } from "./grading.js";
import {
  ALL_EXAMS,
  getAssessment,
  resolveClassResults,
} from "./examinationResults.mjs";

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function validSubjectAssessments(cadet, column, allExams) {
  if (!allExams) {
    const assessment = getAssessment(cadet, column);
    return ["PRESENT", "ABSENT"].includes(assessment?.state) ? [assessment] : [];
  }
  return (cadet.exams || [])
    .map((exam) => cadet.assessments?.[exam.examId]?.[column.subject])
    .filter((assessment) => ["PRESENT", "ABSENT"].includes(assessment?.state));
}

function withBottomRanks(eligible) {
  const ordered = [...eligible].sort((left, right) => {
    if (left.aggregatePct !== right.aggregatePct) return left.aggregatePct - right.aggregatePct;
    if (left.totalObtained !== right.totalObtained) return left.totalObtained - right.totalObtained;
    return left.Kit_No.localeCompare(right.Kit_No);
  });
  let previous = null;
  return ordered.map((cadet, index) => {
    const bottomRank = previous && previous.aggregatePct === cadet.aggregatePct &&
      previous.totalObtained === cadet.totalObtained
      ? previous.bottomRank
      : index + 1;
    const ranked = { ...cadet, bottomRank };
    previous = ranked;
    return ranked;
  });
}

function attachPublicationState(results, events = []) {
  const byResult = new Map();
  events.forEach((event, index) => {
    const key = String(event.Result_Key || "").trim().toLowerCase();
    if (!key) return;
    const list = byResult.get(key) || [];
    list.push({ ...event, _rowIndex: index });
    byResult.set(key, list);
  });

  return results.map((result) => {
    const records = byResult.get(result.resultKey.toLowerCase()) || [];
    records.sort((left, right) => {
      const leftTime = Date.parse(left.Recorded_At || "");
      const rightTime = Date.parse(right.Recorded_At || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left._rowIndex - right._rowIndex;
    });
    const latest = records.at(-1) || null;
    const fingerprintMatches = latest && latest.Calculation_Fingerprint === result.calculationFingerprint;
    const explicitStatus = fingerprintMatches ? String(latest.Result_Status || "").trim() : "";
    const hasOfficialPublication = records.some((record) =>
      ["published", "revised"].includes(String(record.Result_Status || "").trim().toLowerCase())
    );
    return {
      ...result,
      publicationStatus: explicitStatus || (hasOfficialPublication ? "UNPUBLISHED_CHANGES" : null),
      publicationEvent: fingerprintMatches ? latest : null,
      hasPriorOfficialPublication: hasOfficialPublication,
    };
  });
}

export function buildClassAnalyticsData(
  db = {},
  grade,
  section,
  examId = ALL_EXAMS,
  academicSession = ""
) {
  const resolved = resolveClassResults(db, grade, section, examId, academicSession);
  const meritGrid = attachPublicationState(resolved.results, db.Result_Publications || []);
  const eligible = meritGrid.filter((cadet) => cadet.rankEligible);

  const isAllExams = examId === ALL_EXAMS;
  const averageColumns = isAllExams ? resolved.subjectColumns : resolved.assessmentColumns;
  const subjectAverages = averageColumns.map((column) => {
    let obtained = 0;
    let maximum = 0;
    let assessedStudents = 0;
    let passCount = 0;
    let failCount = 0;
    let absentStudents = 0;
    let absentAssessments = 0;
    const percentages = [];
    const gradeCounts = new Map();
    for (const cadet of meritGrid) {
      const assessments = validSubjectAssessments(cadet, column, isAllExams);
      if (assessments.length === 0) continue;
      const scoreObtained = assessments.reduce((sum, assessment) => sum + assessment.obtained, 0);
      const scoreMaximum = assessments.reduce((sum, assessment) => sum + assessment.maxMarks, 0);
      const percentage = scoreMaximum > 0 ? (scoreObtained / scoreMaximum) * 100 : 0;
      obtained += scoreObtained;
      maximum += scoreMaximum;
      assessedStudents++;
      percentages.push(percentage);
      const absenceCount = assessments.filter((assessment) => assessment.state === "ABSENT").length;
      absentAssessments += absenceCount;
      if (absenceCount > 0) absentStudents++;
      if (absenceCount === 0 && percentage >= 40) passCount++;
      else failCount++;
      const grade = calculateGradeInfo(percentage, db.Grading_System || []).grade;
      gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
    }
    const averagePercentage = maximum > 0 ? roundOne((obtained / maximum) * 100) : 0;
    return {
      key: column.key,
      subject: column.subject,
      examId: column.examId || null,
      examName: column.examName || null,
      label: column.label,
      averageScore: assessedStudents ? roundOne(obtained / assessedStudents) : 0,
      averageMax: assessedStudents ? roundOne(maximum / assessedStudents) : 0,
      averagePercentage,
      highestPercentage: percentages.length ? roundOne(Math.max(...percentages)) : 0,
      lowestPercentage: percentages.length ? roundOne(Math.min(...percentages)) : 0,
      passRate: assessedStudents ? roundOne((passCount / assessedStudents) * 100) : 0,
      failRate: assessedStudents ? roundOne((failCount / assessedStudents) * 100) : 0,
      passCount,
      failCount,
      assessedStudents,
      absentStudents,
      absentAssessments,
      gradeDistribution: Array.from(gradeCounts, ([grade, count]) => ({ grade, count })),
    };
  });

  const gradeNames = ["A++", "A+", "A", "B++", "B+", "B", "C", "D", "E", "U"];
  const gradeDistribution = gradeNames.map((gradeName) => ({
    grade: gradeName,
    count: eligible.filter((cadet) => cadet.letterGrade === gradeName).length,
  }));

  const passedCount = eligible.filter((cadet) => cadet.passStatus === "PASS").length;
  const failedCount = eligible.filter((cadet) => cadet.passStatus === "FAIL").length;
  const classAverage = eligible.length
    ? roundOne(eligible.reduce((sum, cadet) => sum + cadet.aggregatePct, 0) / eligible.length)
    : 0;
  const appearedCount = meritGrid.filter((cadet) =>
    Object.values(cadet.assessments || {}).some((exam) =>
      Object.values(exam || {}).some((assessment) => assessment.state === "PRESENT")
    )
  ).length;
  const absentCount = meritGrid.filter((cadet) =>
    cadet.expectedAssessments.length > 0 && cadet.absentCount === cadet.expectedAssessments.length
  ).length;
  const bottomRanked = withBottomRanks(eligible);
  const topPerformers = eligible.filter((cadet) => cadet.meritRank && cadet.meritRank <= 3);
  const bottomPerformers = bottomRanked.filter((cadet) => cadet.bottomRank <= 3);
  const highestPerformer = eligible[0] || null;
  const lowestPerformer = bottomRanked[0] || null;

  return {
    empty: resolved.students.length === 0 || averageColumns.length === 0,
    students: resolved.students,
    exams: resolved.exams,
    subjects: resolved.subjects,
    examColumns: resolved.examColumns,
    subjectColumns: resolved.subjectColumns,
    assessmentColumns: resolved.assessmentColumns,
    meritGrid,
    rankedCadets: eligible,
    subjectAverages,
    gradeDistribution,
    issues: resolved.issues,
    kpis: {
      totalCadets: resolved.students.length,
      appearedCount,
      absentCount,
      evaluatedCadets: eligible.length,
      incompleteCadets: meritGrid.filter((cadet) => cadet.resultStatus === "INCOMPLETE").length,
      invalidCadets: meritGrid.filter((cadet) => ["INVALID", "CONFIGURATION_ERROR"].includes(cadet.resultStatus)).length,
      classAverage,
      averageObtained: eligible.length ? roundOne(eligible.reduce((sum, cadet) => sum + cadet.totalObtained, 0) / eligible.length) : 0,
      averageMaximum: eligible.length ? roundOne(eligible.reduce((sum, cadet) => sum + cadet.totalMaxMarks, 0) / eligible.length) : 0,
      highestPercentage: highestPerformer?.aggregatePct ?? 0,
      highestObtained: highestPerformer?.totalObtained ?? 0,
      highestMaximum: highestPerformer?.totalMaxMarks ?? 0,
      lowestPercentage: lowestPerformer?.aggregatePct ?? 0,
      lowestObtained: lowestPerformer?.totalObtained ?? 0,
      lowestMaximum: lowestPerformer?.totalMaxMarks ?? 0,
      classGrade: eligible.length ? calculateGradeInfo(classAverage, db.Grading_System || []).grade : null,
      passRate: eligible.length ? roundOne((passedCount / eligible.length) * 100) : 0,
      failRate: eligible.length ? roundOne((failedCount / eligible.length) * 100) : 0,
      passedCount,
      failedCount,
      topCadet: eligible[0] || null,
      topPerformers,
      bottomPerformers,
      atRiskCadets: eligible.filter((cadet) => cadet.passStatus === "FAIL"),
    },
  };
}

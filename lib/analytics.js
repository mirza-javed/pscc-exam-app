import { calculateGradeInfo } from "./grading";
import {
  ALL_EXAMS,
  getAssessment,
  resolveClassResults,
} from "./examinationResults.mjs";

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

  const subjectAverages = resolved.assessmentColumns.map((column) => {
    let obtained = 0;
    let maximum = 0;
    let assessedStudents = 0;
    let passCount = 0;
    let absentStudents = 0;
    for (const cadet of eligible) {
      const score = getAssessment(cadet, column);
      if (!score || !["PRESENT", "ABSENT"].includes(score.state)) continue;
      obtained += score.obtained;
      maximum += score.maxMarks;
      assessedStudents++;
      if (score.isAbsent) absentStudents++;
      else if (score.pct >= 40) passCount++;
    }
    const averagePercentage = maximum > 0 ? Math.round((obtained / maximum) * 1000) / 10 : 0;
    return {
      key: column.key,
      subject: column.subject,
      examId: column.examId,
      examName: column.examName,
      label: column.label,
      averageScore: assessedStudents ? Math.round((obtained / assessedStudents) * 10) / 10 : 0,
      averageMax: assessedStudents ? Math.round((maximum / assessedStudents) * 10) / 10 : 0,
      averagePercentage,
      passRate: assessedStudents ? Math.round((passCount / assessedStudents) * 1000) / 10 : 0,
      assessedStudents,
      absentStudents,
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
    ? Math.round((eligible.reduce((sum, cadet) => sum + cadet.aggregatePct, 0) / eligible.length) * 10) / 10
    : 0;

  return {
    empty: resolved.students.length === 0 || resolved.assessmentColumns.length === 0,
    students: resolved.students,
    exams: resolved.exams,
    subjects: resolved.subjects,
    assessmentColumns: resolved.assessmentColumns,
    meritGrid,
    rankedCadets: eligible,
    subjectAverages,
    gradeDistribution,
    issues: resolved.issues,
    kpis: {
      totalCadets: resolved.students.length,
      evaluatedCadets: eligible.length,
      incompleteCadets: meritGrid.filter((cadet) => cadet.resultStatus === "INCOMPLETE").length,
      invalidCadets: meritGrid.filter((cadet) => ["INVALID", "CONFIGURATION_ERROR"].includes(cadet.resultStatus)).length,
      classAverage,
      classGrade: eligible.length ? calculateGradeInfo(classAverage, db.Grading_System || []).grade : null,
      passRate: eligible.length ? Math.round((passedCount / eligible.length) * 1000) / 10 : 0,
      passedCount,
      failedCount,
      topCadet: eligible[0] || null,
      atRiskCadets: eligible.filter((cadet) => cadet.passStatus === "FAIL"),
    },
  };
}

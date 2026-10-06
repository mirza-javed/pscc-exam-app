import { normalizeValue, ALL_EXAMS } from "./identifiers.mjs";
export const RESULT_POLICY_VERSION = "TASK-1.5-2026-09";
export const PUBLICATION_STATUSES = Object.freeze({ DRAFT: "Draft", PUBLISHED: "Published", REVISED: "Revised", UNPUBLISHED_CHANGES: "UNPUBLISHED_CHANGES" });
function fingerprintPayload(result) {
  const assessments = [];
  for (const exam of result.exams) {
    for (const assessment of Object.values(result.assessments[exam.examId] || {})) {
      assessments.push([exam.examId, assessment.subject, assessment.state, assessment.obtained, assessment.maxMarks]);
    }
  }
  assessments.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({
    policy: RESULT_POLICY_VERSION,
    kitNo: result.Kit_No,
    grade: result.Grade,
    section: result.Section,
    selectedExam: result.selectedExam,
    academicSession: result.academicSession,
    assessments,
    totalObtained: result.totalObtained,
    totalMaxMarks: result.totalMaxMarks,
    aggregatePct: result.aggregatePct,
    letterGrade: result.letterGrade,
    passStatus: result.passStatus,
  });
}

export function fingerprintResult(result) {
  const input = fingerprintPayload(result);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildResultKey({ kitNo, grade, section, academicSession, selectedExam }) {
  const scope = selectedExam === ALL_EXAMS ? "all" : normalizeValue(selectedExam);
  return [kitNo, grade, section, academicSession, scope].map(normalizeValue).join("|");
}

export function attachPublicationState(results, events = []) {
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
      publicationStatus: explicitStatus || (hasOfficialPublication ? PUBLICATION_STATUSES.UNPUBLISHED_CHANGES : null),
      publicationEvent: fingerprintMatches ? latest : null,
      hasPriorOfficialPublication: hasOfficialPublication,
    };
  });
}

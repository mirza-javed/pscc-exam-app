import { isSubjectApplicableToCadet } from "./academicRules.mjs";
import { normalizeValue } from "./authorization.mjs";
import { calculateGradeInfo } from "./grading.js";

export const ALL_EXAMS = "All Exams";
export const RESULT_POLICY_VERSION = "TASK-1.5-2026-09";
export const ABSENCE_VALUES = Object.freeze(["ab", "a", "absent", "a/b", "n/a", "na", "-"]);

const ABSENCE_SET = new Set(ABSENCE_VALUES);
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function text(value) {
  return String(value ?? "").trim();
}

function compareSubjects(left, right) {
  const leftConduct = left.toLowerCase().includes("conduct");
  const rightConduct = right.toLowerCase().includes("conduct");
  if (leftConduct !== rightConduct) return leftConduct ? 1 : -1;
  return left.localeCompare(right);
}

export function getAcademicSession(row) {
  return text(row?.Academic_Session ?? row?.Academic_Year ?? row?.Session ?? row?.Year);
}

function parseStrictNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!DECIMAL_PATTERN.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function normalizeMarkValue(value) {
  const raw = text(value);
  if (!raw) return { state: "MISSING", value: null, identity: "MISSING" };
  if (ABSENCE_SET.has(raw.toLowerCase())) return { state: "ABSENT", value: 0, identity: "ABSENT" };
  const number = parseStrictNumber(value);
  if (number === null || number < 0) return { state: "INVALID", value: null, identity: `INVALID:${raw}` };
  return { state: "PRESENT", value: number, identity: `PRESENT:${number}` };
}

function assessmentKey(examId, subject) {
  return `${normalizeValue(examId)}\u0000${normalizeValue(subject)}`;
}

function markKey(kitNo, examId, subject) {
  return `${normalizeValue(kitNo)}\u0000${assessmentKey(examId, subject)}`;
}

function resolveExamDefinitions(examScheme, grade, selectedExam, academicSession) {
  const gradeRows = (examScheme || []).filter((row) => normalizeValue(row.Grade) === normalizeValue(grade));
  const issues = [];
  let rows;
  if (selectedExam === ALL_EXAMS) {
    if (!text(academicSession)) {
      return {
        exams: [],
        rows: [],
        issues: [{ code: "ACADEMIC_SESSION_REQUIRED", message: "Select an Academic Session/Year for All Exams." }],
      };
    }
    rows = gradeRows.filter((row) => normalizeValue(getAcademicSession(row)) === normalizeValue(academicSession));
  } else {
    rows = gradeRows.filter((row) => normalizeValue(row.Exam_ID) === normalizeValue(selectedExam));
  }

  const examMap = new Map();
  for (const row of rows) {
    const examId = text(row.Exam_ID);
    const subject = text(row.Subject);
    if (!examId || !subject) {
      issues.push({ code: "INVALID_EXAM_SCHEME_KEY", message: "An exam scheme row is missing Exam_ID or Subject." });
      continue;
    }
    const key = normalizeValue(examId);
    if (!examMap.has(key)) {
      examMap.set(key, {
        examId,
        examName: text(row.Exam_Name) || examId,
        academicSession: getAcademicSession(row),
      });
    }
  }
  const exams = Array.from(examMap.values()).sort((left, right) => left.examId.localeCompare(right.examId));
  for (const exam of exams) {
    const sessions = new Set(
      rows
        .filter((row) => normalizeValue(row.Exam_ID) === normalizeValue(exam.examId))
        .map(getAcademicSession)
        .filter(Boolean)
        .map(normalizeValue)
    );
    if (sessions.size > 1) {
      issues.push({
        code: "AMBIGUOUS_ACADEMIC_SESSION",
        message: `${exam.examId} is assigned to more than one Academic Session/Year.`,
      });
    }
  }
  if (exams.length === 0) {
    issues.push({
      code: "NO_VALID_EXAMS",
      message: selectedExam === ALL_EXAMS
        ? "No configured exams match the selected Grade/Class and Academic Session/Year."
        : "The selected exam is not configured for this Grade/Class.",
    });
  }
  return { exams, rows, issues };
}

function groupSchemes(rows) {
  const groups = new Map();
  for (const row of rows) {
    const examId = text(row.Exam_ID);
    const subject = text(row.Subject);
    if (!examId || !subject) continue;
    const key = assessmentKey(examId, subject);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

function groupMarks(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const kitNo = text(row.Kit_No ?? row.Student_ID);
    const examId = text(row.Exam_ID);
    const subject = text(row.Subject);
    if (!kitNo || !examId || !subject) continue;
    const key = markKey(kitNo, examId, subject);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

function resolveAssessment({ schemeRows, markRows, exam, subject, gradingSystem }) {
  const base = { examId: exam.examId, examName: exam.examName, subject, obtained: null, pct: null, isAbsent: false, gradeInfo: null };
  if (schemeRows.length !== 1) {
    return {
      ...base,
      state: "CONFIGURATION_ERROR",
      maxMarks: null,
      message: schemeRows.length === 0 ? "Maximum marks configuration is missing." : "Maximum marks configuration is duplicated.",
    };
  }
  const maxMarks = parseStrictNumber(schemeRows[0].Max_Marks);
  if (maxMarks === null || maxMarks <= 0) {
    return { ...base, state: "CONFIGURATION_ERROR", maxMarks: null, message: "Maximum marks must be a positive finite number." };
  }
  if (!markRows || markRows.length === 0) {
    return { ...base, state: "MISSING", maxMarks, message: "Required marks have not been entered." };
  }

  const normalized = markRows.map((row) => normalizeMarkValue(row.Marks_Obtained));
  if (new Set(normalized.map((item) => item.identity)).size > 1) {
    return { ...base, state: "DUPLICATE_CONFLICT", maxMarks, message: "Duplicate marks found — correction required" };
  }
  const resolved = normalized[0];
  if (resolved.state === "MISSING" || resolved.state === "INVALID") {
    return {
      ...base,
      state: resolved.state,
      maxMarks,
      message: resolved.state === "MISSING" ? "Required marks are blank." : "Marks contain invalid legacy data.",
    };
  }
  if (resolved.state === "PRESENT" && resolved.value > maxMarks) {
    return { ...base, state: "INVALID", maxMarks, message: "Obtained marks exceed the configured maximum." };
  }

  const obtained = resolved.state === "ABSENT" ? 0 : resolved.value;
  const pct = (obtained / maxMarks) * 100;
  return {
    ...base,
    state: resolved.state,
    obtained,
    maxMarks,
    pct,
    isAbsent: resolved.state === "ABSENT",
    gradeInfo: resolved.state === "ABSENT" ? null : calculateGradeInfo(pct, gradingSystem),
    identicalDuplicateCount: markRows.length,
    message: resolved.state === "ABSENT" ? "Absent from examination." : "",
  };
}

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

function resolveStudent({ student, grade, section, selectedExam, academicSession, exams, schemeGroups, marksGroups, gradingSystem, issues }) {
  const kitNo = text(student.Kit_No ?? student.Student_ID);
  const assessments = {};
  const expectedAssessments = [];
  const errors = [...issues];
  let partialObtained = 0;
  let partialMaxMarks = 0;
  let absentCount = 0;
  let failedSubjectCount = 0;
  let hasMissing = false;
  let hasInvalid = false;
  let hasConfigurationError = issues.length > 0;

  for (const exam of exams) {
    assessments[exam.examId] = {};
    const subjects = Array.from(new Set(
      Array.from(schemeGroups.values())
        .filter((rows) => normalizeValue(rows[0].Exam_ID) === normalizeValue(exam.examId))
        .map((rows) => text(rows[0].Subject))
    )).filter((subject) => isSubjectApplicableToCadet(subject, student, grade)).sort(compareSubjects);

    for (const subject of subjects) {
      const key = assessmentKey(exam.examId, subject);
      const assessment = resolveAssessment({
        schemeRows: schemeGroups.get(key) || [],
        markRows: marksGroups.get(markKey(kitNo, exam.examId, subject)) || [],
        exam,
        subject,
        gradingSystem,
      });
      assessments[exam.examId][subject] = assessment;
      expectedAssessments.push({ examId: exam.examId, examName: exam.examName, subject });
      if (assessment.state === "CONFIGURATION_ERROR") hasConfigurationError = true;
      else if (["DUPLICATE_CONFLICT", "INVALID"].includes(assessment.state)) hasInvalid = true;
      else if (assessment.state === "MISSING") hasMissing = true;
      else {
        partialObtained += assessment.obtained;
        partialMaxMarks += assessment.maxMarks;
        if (assessment.isAbsent) absentCount++;
        if (assessment.isAbsent || assessment.pct < 40) failedSubjectCount++;
      }
      if (assessment.message && !["PRESENT", "ABSENT"].includes(assessment.state)) {
        errors.push({ code: assessment.state, examId: exam.examId, subject, message: assessment.message });
      }
    }
  }

  const isComplete = !hasMissing && expectedAssessments.length > 0;
  const assessmentsValid = !hasInvalid && !hasConfigurationError;
  const candidatePct = isComplete && assessmentsValid && partialMaxMarks > 0
    ? Math.round((partialObtained / partialMaxMarks) * 1000) / 10
    : null;
  const gradeInfo = candidatePct === null ? null : calculateGradeInfo(candidatePct, gradingSystem);
  if (gradeInfo && !gradeInfo.valid) {
    hasConfigurationError = true;
    errors.push({ code: "GRADING_CONFIGURATION_ERROR", message: gradeInfo.remarks });
  }
  const isValid = !hasInvalid && !hasConfigurationError;
  const isFinal = isComplete && isValid;
  const totalObtained = isFinal ? partialObtained : null;
  const totalMaxMarks = isFinal ? partialMaxMarks : null;
  const aggregatePct = isFinal ? candidatePct : null;
  let resultStatus = "INCOMPLETE";
  if (hasConfigurationError) resultStatus = "CONFIGURATION_ERROR";
  else if (hasInvalid) resultStatus = "INVALID";
  else if (isFinal) resultStatus = absentCount > 0 || failedSubjectCount > 0 || gradeInfo?.status === "FAIL" ? "FAIL" : "PASS";

  const result = {
    ...student,
    Kit_No: kitNo,
    Name: student.Name || student.Full_Name || `Cadet ${kitNo}`,
    Grade: student.Grade || grade,
    Section: student.Section || section,
    Group: student.Group || student.Stream || "General",
    selectedExam,
    academicSession: text(academicSession),
    exams,
    assessments,
    scores: selectedExam === ALL_EXAMS ? {} : (assessments[exams[0]?.examId] || {}),
    expectedAssessments,
    partialObtained,
    partialMaxMarks,
    totalObtained,
    totalMaxMarks,
    aggregatePct,
    letterGrade: isFinal && gradeInfo?.valid ? gradeInfo.grade : null,
    remarks: isFinal && gradeInfo?.valid ? gradeInfo.remarks : null,
    passStatus: resultStatus,
    resultStatus,
    isPassed: resultStatus === "PASS",
    isComplete,
    isValid,
    isFinal,
    rankEligible: isFinal,
    absentCount,
    failedSubjectCount,
    errors,
    meritRank: null,
  };
  result.calculationFingerprint = fingerprintResult(result);
  result.resultKey = buildResultKey({ kitNo, grade, section, academicSession, selectedExam });
  return result;
}

export function resolveClassResults(db = {}, grade, section, selectedExam = ALL_EXAMS, academicSession = "") {
  const students = (db.Students || []).filter(
    (student) => normalizeValue(student.Grade) === normalizeValue(grade) && normalizeValue(student.Section) === normalizeValue(section)
  );
  const definition = resolveExamDefinitions(db.exam_scheme || [], grade, selectedExam, academicSession);
  const resolvedSession = selectedExam === ALL_EXAMS
    ? academicSession
    : definition.exams[0]?.academicSession || academicSession;
  const schemeGroups = groupSchemes(definition.rows);
  const marksGroups = groupMarks(db.Marks_Log || []);
  const results = students.map((student) => resolveStudent({
    student,
    grade,
    section,
    selectedExam,
    academicSession: resolvedSession,
    exams: definition.exams,
    schemeGroups,
    marksGroups,
    gradingSystem: db.Grading_System || [],
    issues: definition.issues,
  }));

  const ranked = results.filter((result) => result.rankEligible).sort((left, right) => {
    if (right.aggregatePct !== left.aggregatePct) return right.aggregatePct - left.aggregatePct;
    if (right.totalObtained !== left.totalObtained) return right.totalObtained - left.totalObtained;
    return left.Kit_No.localeCompare(right.Kit_No);
  });
  ranked.forEach((result, index) => {
    const previous = ranked[index - 1];
    result.meritRank = previous && previous.aggregatePct === result.aggregatePct && previous.totalObtained === result.totalObtained
      ? previous.meritRank
      : index + 1;
  });
  const ineligible = results.filter((result) => !result.rankEligible).sort((a, b) => a.Kit_No.localeCompare(b.Kit_No));

  const assessmentColumns = [];
  for (const exam of definition.exams) {
    const subjects = Array.from(new Set(
      definition.rows
        .filter((row) => normalizeValue(row.Exam_ID) === normalizeValue(exam.examId))
        .map((row) => text(row.Subject))
        .filter(Boolean)
    )).sort(compareSubjects);
    for (const subject of subjects) {
      assessmentColumns.push({
        key: `${exam.examId}::${subject}`,
        examId: exam.examId,
        examName: exam.examName,
        subject,
        label: selectedExam === ALL_EXAMS ? `${exam.examName} — ${subject}` : subject,
      });
    }
  }
  return {
    students,
    exams: definition.exams,
    assessmentColumns,
    subjects: Array.from(new Set(assessmentColumns.map((column) => column.subject))),
    results: [...ranked, ...ineligible],
    issues: definition.issues,
  };
}

export function getAssessment(result, column) {
  return result?.assessments?.[column.examId]?.[column.subject] || null;
}

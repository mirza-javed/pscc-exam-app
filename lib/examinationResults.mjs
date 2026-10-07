import { MARK_STATES } from "./domain/markValues.mjs";
import { RESULT_STATES } from "./domain/resultStates.mjs";
import { compareRankedResults, sharesRank } from "./domain/ranking.mjs";
import { fingerprintResult, buildResultKey } from "./domain/publications.mjs";
export { fingerprintResult, buildResultKey, RESULT_POLICY_VERSION } from "./domain/publications.mjs";
import { isSubjectApplicableToCadet } from "./academicRules.mjs";
import { normalizeValue, ALL_EXAMS, ALL_SECTIONS, getAcademicSession } from "./domain/identifiers.mjs";
export { ALL_EXAMS, ALL_SECTIONS, getAcademicSession } from "./domain/identifiers.mjs";
import { normalizeMarkValue, parseStrictNumber } from "./domain/markValues.mjs";
export { ABSENCE_VALUES, normalizeMarkValue } from "./domain/markValues.mjs";
import { calculateGradeInfo } from "./grading.js";

function text(value) {
  return String(value ?? "").trim();
}

function compareSubjects(left, right) {
  const leftConduct = left.toLowerCase().includes("conduct");
  const rightConduct = right.toLowerCase().includes("conduct");
  if (leftConduct !== rightConduct) return leftConduct ? 1 : -1;
  return left.localeCompare(right);
}

function parseStrictInteger(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  const raw = text(value);
  if (!/^-?\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) ? number : null;
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
  let exams = Array.from(examMap.values());
  const configuredExamCount = exams.length;
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

  if (selectedExam === ALL_EXAMS) {
    const orderOwners = new Map();
    let hasOrderError = false;
    exams = exams.map((exam) => {
      const examRows = rows.filter((row) => normalizeValue(row.Exam_ID) === normalizeValue(exam.examId));
      const parsedOrders = examRows.map((row) => parseStrictInteger(row.Exam_Order));
      const validOrders = new Set(parsedOrders.filter((value) => value !== null));
      if (parsedOrders.some((value) => value === null)) {
        hasOrderError = true;
        issues.push({
          code: "MISSING_EXAM_ORDER",
          examId: exam.examId,
          message: `${exam.examName} must have an integer Exam_Order on every exam_scheme row.`,
        });
      }
      if (validOrders.size > 1) {
        hasOrderError = true;
        issues.push({
          code: "INCONSISTENT_EXAM_ORDER",
          examId: exam.examId,
          message: `${exam.examName} has inconsistent Exam_Order values.`,
        });
      }
      const examOrder = validOrders.size === 1 && parsedOrders.every((value) => value !== null)
        ? Array.from(validOrders)[0]
        : null;
      if (examOrder !== null) {
        const owner = orderOwners.get(examOrder);
        if (owner && normalizeValue(owner.examId) !== normalizeValue(exam.examId)) {
          hasOrderError = true;
          issues.push({
            code: "DUPLICATE_EXAM_ORDER",
            examId: exam.examId,
            message: `${exam.examName} and ${owner.examName} both use Exam_Order ${examOrder}.`,
          });
        } else {
          orderOwners.set(examOrder, exam);
        }
      }
      return { ...exam, examOrder };
    });
    exams = hasOrderError ? [] : exams.sort((left, right) => left.examOrder - right.examOrder);
  }
  if (configuredExamCount === 0) {
    issues.push({
      code: "NO_VALID_EXAMS",
      message: selectedExam === ALL_EXAMS
        ? "No configured exams match the selected Grade/Class and Academic Session/Year."
        : "The selected exam is not configured for this Grade/Class.",
    });
  }
  return { exams, rows, issues };
}

function summarizeAssessments(assessments) {
  if (!assessments.length) {
    return { state: MARK_STATES.NOT_APPLICABLE, obtained: null, maxMarks: null, partialObtained: 0, partialMaxMarks: 0 };
  }
  let partialObtained = 0;
  let partialMaxMarks = 0;
  let hasMissing = false;
  let hasInvalid = false;
  let hasConfigurationError = false;
  let absentCount = 0;
  for (const assessment of assessments) {
    if (assessment.state === MARK_STATES.CONFIGURATION_ERROR) hasConfigurationError = true;
    else if ([MARK_STATES.DUPLICATE_CONFLICT, MARK_STATES.INVALID].includes(assessment.state)) hasInvalid = true;
    else if (assessment.state === MARK_STATES.MISSING) hasMissing = true;
    else if ([MARK_STATES.PRESENT, MARK_STATES.ABSENT].includes(assessment.state)) {
      partialObtained += assessment.obtained;
      partialMaxMarks += assessment.maxMarks;
      if (assessment.state === MARK_STATES.ABSENT) absentCount++;
    }
  }
  let state = MARK_STATES.COMPLETE;
  if (hasConfigurationError) state = MARK_STATES.CONFIGURATION_ERROR;
  else if (hasInvalid) state = MARK_STATES.INVALID;
  else if (hasMissing) state = MARK_STATES.MISSING;
  const isComplete = state === MARK_STATES.COMPLETE;
  return {
    state,
    obtained: isComplete ? partialObtained : null,
    maxMarks: isComplete ? partialMaxMarks : null,
    partialObtained,
    partialMaxMarks,
    absentCount,
  };
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
      state: MARK_STATES.CONFIGURATION_ERROR,
      maxMarks: null,
      message: schemeRows.length === 0 ? "Maximum marks configuration is missing." : "Maximum marks configuration is duplicated.",
    };
  }
  const maxMarks = parseStrictNumber(schemeRows[0].Max_Marks);
  if (maxMarks === null || maxMarks <= 0) {
    return { ...base, state: MARK_STATES.CONFIGURATION_ERROR, maxMarks: null, message: "Maximum marks must be a positive finite number." };
  }
  if (!markRows || markRows.length === 0) {
    return { ...base, state: MARK_STATES.MISSING, maxMarks, message: "Required marks have not been entered." };
  }

  const normalized = markRows.map((row) => normalizeMarkValue(row.Marks_Obtained));
  if (new Set(normalized.map((item) => item.identity)).size > 1) {
    return { ...base, state: MARK_STATES.DUPLICATE_CONFLICT, maxMarks, message: "Duplicate marks found — correction required" };
  }
  const resolved = normalized[0];
  if (resolved.state === MARK_STATES.MISSING || resolved.state === MARK_STATES.INVALID) {
    return {
      ...base,
      state: resolved.state,
      maxMarks,
      message: resolved.state === MARK_STATES.MISSING ? "Required marks are blank." : "Marks contain invalid legacy data.",
    };
  }
  if (resolved.state === MARK_STATES.PRESENT && resolved.value > maxMarks) {
    return { ...base, state: MARK_STATES.INVALID, maxMarks, message: "Obtained marks exceed the configured maximum." };
  }

  const obtained = resolved.state === MARK_STATES.ABSENT ? 0 : resolved.value;
  const pct = (obtained / maxMarks) * 100;
  return {
    ...base,
    state: resolved.state,
    obtained,
    maxMarks,
    pct,
    isAbsent: resolved.state === MARK_STATES.ABSENT,
    gradeInfo: resolved.state === MARK_STATES.ABSENT ? null : calculateGradeInfo(pct, gradingSystem),
    identicalDuplicateCount: markRows.length,
    message: resolved.state === MARK_STATES.ABSENT ? "Absent from examination." : "",
  };
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
      if (assessment.state === MARK_STATES.CONFIGURATION_ERROR) hasConfigurationError = true;
      else if ([MARK_STATES.DUPLICATE_CONFLICT, MARK_STATES.INVALID].includes(assessment.state)) hasInvalid = true;
      else if (assessment.state === MARK_STATES.MISSING) hasMissing = true;
      else {
        partialObtained += assessment.obtained;
        partialMaxMarks += assessment.maxMarks;
        if (assessment.isAbsent) absentCount++;
        if (assessment.isAbsent || assessment.pct < 40) failedSubjectCount++;
      }
      if (assessment.message && ![MARK_STATES.PRESENT, MARK_STATES.ABSENT].includes(assessment.state)) {
        errors.push({ code: assessment.state, examId: exam.examId, subject, message: assessment.message });
      }
    }
  }


  const examTotals = {};
  for (const exam of exams) {
    examTotals[exam.examId] = summarizeAssessments(Object.values(assessments[exam.examId] || {}));
  }
  const subjectNames = Array.from(new Set(
    Object.values(assessments).flatMap((examAssessments) => Object.keys(examAssessments))
  )).sort(compareSubjects);
  const subjectTotals = {};
  for (const subject of subjectNames) {
    const subjectAssessments = exams
      .map((exam) => assessments[exam.examId]?.[subject])
      .filter(Boolean);
    subjectTotals[subject] = summarizeAssessments(subjectAssessments);
    if (selectedExam === ALL_EXAMS) {
      const total = subjectTotals[subject];
      const pct = total.state === MARK_STATES.COMPLETE && total.maxMarks > 0
        ? (total.obtained / total.maxMarks) * 100
        : null;
      total.pct = pct;
      total.gradeInfo = pct === null ? null : calculateGradeInfo(pct, gradingSystem);
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
  let resultStatus = RESULT_STATES.INCOMPLETE;
  if (hasConfigurationError) resultStatus = RESULT_STATES.CONFIGURATION_ERROR;
  else if (hasInvalid) resultStatus = RESULT_STATES.INVALID;
  else if (isFinal) resultStatus = absentCount > 0 || failedSubjectCount > 0 || gradeInfo?.status === RESULT_STATES.FAIL ? RESULT_STATES.FAIL : RESULT_STATES.PASS;

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
    examTotals,
    subjectTotals,
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
    isPassed: resultStatus === RESULT_STATES.PASS,
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
  result.resultKey = buildResultKey({
    kitNo,
    grade: result.Grade,
    section: result.Section,
    academicSession,
    selectedExam,
  });
  return result;
}

export function resolveClassResults(db = {}, grade, section, selectedExam = ALL_EXAMS, academicSession = "") {
  const includesAllSections = normalizeValue(section) === normalizeValue(ALL_SECTIONS);
  const students = (db.Students || []).filter(
    (student) => normalizeValue(student.Grade) === normalizeValue(grade) &&
      (includesAllSections || normalizeValue(student.Section) === normalizeValue(section))
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
    section: student.Section || section,
    selectedExam,
    academicSession: resolvedSession,
    exams: definition.exams,
    schemeGroups,
    marksGroups,
    gradingSystem: db.Grading_System || [],
    issues: definition.issues,
  }));

  const ranked = results.filter((result) => result.rankEligible).sort(compareRankedResults);
  ranked.forEach((result, index) => {
    const previous = ranked[index - 1];
    result.meritRank = sharesRank(previous, result)
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
  const examColumns = definition.exams.map((exam) => ({
    key: exam.examId,
    examId: exam.examId,
    examName: exam.examName,
    examOrder: exam.examOrder ?? null,
    label: exam.examName,
  }));
  const subjectColumns = Array.from(new Set(
    definition.rows.map((row) => text(row.Subject)).filter(Boolean)
  )).sort(compareSubjects).map((subject) => ({
    key: `subject::${subject}`,
    subject,
    label: subject,
  }));
  return {
    students,
    exams: definition.exams,
    examColumns,
    subjectColumns,
    assessmentColumns,
    subjects: subjectColumns.map((column) => column.subject),
    results: [...ranked, ...ineligible],
    issues: definition.issues,
  };
}

export function getAssessment(result, column) {
  return result?.assessments?.[column.examId]?.[column.subject] || null;
}

export function getExamTotal(result, examId) {
  return result?.examTotals?.[examId] || null;
}

export function getSubjectTotal(result, subject) {
  return result?.subjectTotals?.[subject] || null;
}

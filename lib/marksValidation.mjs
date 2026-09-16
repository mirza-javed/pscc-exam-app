import { isSubjectApplicableToCadet } from "./academicRules.mjs";
import { buildUniqueIndex, normalizeValue } from "./authorization.mjs";
import { isSpreadsheetFormulaLike } from "./writeValidation.mjs";

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const MAX_MARK_RECORDS = 500;

function addError(errors, row, field, code, message) {
  errors.push({ row, field, code, message });
}

function requiredText(value, field, errors) {
  if (typeof value !== "string" && typeof value !== "number") {
    addError(errors, null, field, "REQUIRED", `${field} is required.`);
    return "";
  }
  const text = String(value).trim();
  if (!text) addError(errors, null, field, "REQUIRED", `${field} is required.`);
  return text;
}

function parseMarks(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { valid: true, value }
      : { valid: false, code: "NOT_FINITE", message: "Marks must be a finite number." };
  }
  if (typeof value !== "string" || !value.trim()) {
    return { valid: false, code: "REQUIRED", message: "Marks are required for a present student." };
  }
  const text = value.trim();
  if (!DECIMAL_PATTERN.test(text)) {
    return { valid: false, code: "INVALID_NUMBER", message: "Marks must contain only a valid number." };
  }
  const number = Number(text);
  return Number.isFinite(number)
    ? { valid: true, value: number }
    : { valid: false, code: "NOT_FINITE", message: "Marks must be a finite number." };
}

function compositeKey(kitNo, examId, subject) {
  return [kitNo, examId, subject].map(normalizeValue).join("\u0000");
}

function findSchemeRows(db, examId, grade, subject) {
  return (db.exam_scheme || []).filter(
    (row) =>
      normalizeValue(row.Exam_ID) === normalizeValue(examId) &&
      normalizeValue(row.Grade) === normalizeValue(grade) &&
      normalizeValue(row.Subject) === normalizeValue(subject)
  );
}

export function validateMarksSubmission(body, db = {}) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ row: null, field: "body", code: "INVALID_BODY", message: "Request body must be an object." }],
      records: [],
    };
  }

  const examId = requiredText(body.examId, "examId", errors);
  const grade = requiredText(body.grade, "grade", errors);
  const section = requiredText(body.section, "section", errors);
  const subject = requiredText(body.subject, "subject", errors);
  const records = body.records;

  if (!Array.isArray(records) || records.length === 0) {
    addError(errors, null, "records", "REQUIRED", "At least one student mark record is required.");
  } else if (records.length > MAX_MARK_RECORDS) {
    addError(errors, null, "records", "TOO_MANY_RECORDS", `A maximum of ${MAX_MARK_RECORDS} marks records is allowed.`);
  }

  for (const [field, value] of [["examId", body.examId], ["grade", body.grade], ["section", body.section], ["subject", body.subject]]) {
    if (isSpreadsheetFormulaLike(value)) {
      addError(errors, null, field, "FORMULA_LIKE_VALUE", `${field} is invalid.`);
    }
  }

  if (errors.length > 0) return { valid: false, errors, records: [] };

  const schemeRows = findSchemeRows(db, examId, grade, subject);
  if (schemeRows.length === 0) {
    addError(
      errors,
      null,
      "examId",
      "INVALID_EXAM_SUBJECT",
      "The exam, grade, and subject combination is not configured."
    );
  } else if (schemeRows.length > 1) {
    addError(
      errors,
      null,
      "examId",
      "AMBIGUOUS_EXAM_SCHEME",
      "The exam configuration is duplicated and must be corrected."
    );
  }

  let maxMarks = null;
  let canonicalExamId = examId;
  let canonicalSubject = subject;
  if (schemeRows.length === 1) {
    const scheme = schemeRows[0];
    const parsedMax = parseMarks(scheme.Max_Marks);
    if (!parsedMax.valid || parsedMax.value <= 0) {
      addError(
        errors,
        null,
        "Max_Marks",
        "INVALID_MAXIMUM",
        "The official maximum marks configuration is invalid."
      );
    } else {
      maxMarks = parsedMax.value;
      canonicalExamId = String(scheme.Exam_ID).trim();
      canonicalSubject = String(scheme.Subject).trim();
    }
  }

  const students = buildUniqueIndex(db.Students || [], "Kit_No");
  const existingCompositeCounts = new Map();
  for (const mark of db.Marks_Log || []) {
    const key = compositeKey(mark.Kit_No || mark.Student_ID, mark.Exam_ID, mark.Subject);
    existingCompositeCounts.set(key, (existingCompositeCounts.get(key) || 0) + 1);
  }

  const seenStudents = new Set();
  const seenSubmissionIds = new Set();
  const normalized = [];

  records.forEach((record, index) => {
    const row = index + 1;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      addError(errors, row, "record", "INVALID_RECORD", "Student record must be an object.");
      return;
    }

    const rawKitNo = record.Kit_No ?? record.Student_ID;
    if (typeof rawKitNo !== "string" && typeof rawKitNo !== "number") {
      addError(errors, row, "Kit_No", "REQUIRED", "Kit number is required.");
      return;
    }
    const kitNo = String(rawKitNo).trim();
    const kitKey = normalizeValue(kitNo);
    if (!kitKey) {
      addError(errors, row, "Kit_No", "REQUIRED", "Kit number is required.");
      return;
    }
    if (isSpreadsheetFormulaLike(rawKitNo)) {
      addError(errors, row, "Kit_No", "FORMULA_LIKE_VALUE", "Kit number is invalid.");
    }
    if (seenStudents.has(kitKey)) {
      addError(errors, row, "Kit_No", "DUPLICATE_STUDENT", "This student appears more than once in the request.");
    }
    seenStudents.add(kitKey);

    const student = students.unique.get(kitKey);
    if (!student || students.ambiguous.has(kitKey)) {
      addError(errors, row, "Kit_No", "INVALID_STUDENT", "The student identifier is unknown or ambiguous.");
    } else {
      if (
        normalizeValue(student.Grade) !== normalizeValue(grade) ||
        normalizeValue(student.Section) !== normalizeValue(section)
      ) {
        addError(errors, row, "Kit_No", "STUDENT_SCOPE_MISMATCH", "The student does not belong to the requested class and section.");
      }
      if (!isSubjectApplicableToCadet(canonicalSubject, student, grade)) {
        addError(errors, row, "subject", "SUBJECT_NOT_APPLICABLE", "The subject is not applicable to this student's academic group.");
      }
    }

    let submissionId = "";
    if (record.Submission_ID !== undefined && record.Submission_ID !== null && record.Submission_ID !== "") {
      if (typeof record.Submission_ID !== "string") {
        addError(errors, row, "Submission_ID", "INVALID_SUBMISSION_ID", "Submission ID is invalid.");
      } else {
        submissionId = record.Submission_ID.trim();
        const submissionKey = normalizeValue(submissionId);
        if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
          addError(errors, row, "Submission_ID", "INVALID_SUBMISSION_ID", "Submission ID is invalid.");
        } else if (seenSubmissionIds.has(submissionKey)) {
          addError(errors, row, "Submission_ID", "DUPLICATE_SUBMISSION_ID", "Submission ID appears more than once in the request.");
        }
        seenSubmissionIds.add(submissionKey);
      }
    }

    const attendance = typeof record.attendance === "string"
      ? record.attendance.trim().toLowerCase()
      : "";
    let canonicalMarks = "";
    if (attendance !== "present" && attendance !== "absent") {
      addError(errors, row, "attendance", "INVALID_ATTENDANCE", "Attendance must be explicitly set to present or absent.");
    } else if (attendance === "absent") {
      const suppliedMarks = record.Marks_Obtained;
      if (suppliedMarks !== undefined && suppliedMarks !== null && String(suppliedMarks).trim() !== "") {
        addError(errors, row, "Marks_Obtained", "ABSENT_WITH_MARKS", "An absent student cannot also have obtained marks.");
      }
      canonicalMarks = "Absent";
    } else {
      const parsed = parseMarks(record.Marks_Obtained);
      if (!parsed.valid) {
        addError(errors, row, "Marks_Obtained", parsed.code, parsed.message);
      } else if (parsed.value < 0) {
        addError(errors, row, "Marks_Obtained", "NEGATIVE_MARKS", "Marks must not be negative.");
      } else if (maxMarks !== null && parsed.value > maxMarks) {
        addError(errors, row, "Marks_Obtained", "ABOVE_MAXIMUM", `Marks must not exceed ${maxMarks}.`);
      } else {
        canonicalMarks = String(parsed.value);
      }
    }

    const existingKey = compositeKey(kitNo, canonicalExamId, canonicalSubject);
    if ((existingCompositeCounts.get(existingKey) || 0) > 1) {
      addError(errors, row, "Kit_No", "AMBIGUOUS_EXISTING_MARKS", "Multiple stored marks already exist for this student and assessment.");
    }

    normalized.push({
      Submission_ID: submissionId,
      Kit_No: student ? String(student.Kit_No || student.Student_ID || kitNo).trim() : kitNo,
      Exam_ID: canonicalExamId,
      Subject: canonicalSubject,
      Marks_Obtained: canonicalMarks,
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    records: errors.length === 0 ? normalized : [],
    scope: { examId: canonicalExamId, grade, section, subject: canonicalSubject, maxMarks },
  };
}

import {
  isSpreadsheetFormulaLike,
  normalizeRequiredText,
} from "./writeValidation.mjs";

export const PAPER_SUBMISSION_TYPES = Object.freeze(["Direct Text", "File Upload"]);
export const PAPER_REVIEW_STATUSES = Object.freeze([
  "Pending",
  "Approved",
  "Revision Needed",
]);

export const PAPER_LIMITS = Object.freeze({
  grade: 32,
  subject: 128,
  examId: 128,
  requestId: 128,
  fileUrl: 2048,
  textContent: 45000,
  adminFeedback: 2000,
});

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function fieldError(field, code, message) {
  return { field, code, message };
}

function validateIdentifier(value, field, maxLength, errors) {
  const normalized = normalizeRequiredText(value);
  if (!normalized) {
    errors.push(fieldError(field, "REQUIRED", `${field} is required.`));
  } else if (normalized.length > maxLength) {
    errors.push(fieldError(field, "TOO_LONG", `${field} is too long.`));
  } else if (isSpreadsheetFormulaLike(value)) {
    errors.push(fieldError(field, "FORMULA_LIKE_VALUE", `${field} is invalid.`));
  }
  return normalized;
}

function validateHttpsUrl(value, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(fieldError("fileUrl", "REQUIRED", "A paper URL is required."));
    return "";
  }
  const text = value.trim();
  if (text.length > PAPER_LIMITS.fileUrl) {
    errors.push(fieldError("fileUrl", "TOO_LONG", "The paper URL is too long."));
    return text;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      errors.push(fieldError("fileUrl", "INVALID_URL", "Enter a valid HTTPS paper URL."));
    }
  } catch {
    errors.push(fieldError("fileUrl", "INVALID_URL", "Enter a valid HTTPS paper URL."));
  }
  return text;
}

export function validatePaperSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errors: [fieldError("body", "INVALID_BODY", "Request body must be an object.")],
      value: null,
    };
  }

  const errors = [];
  const grade = validateIdentifier(body.grade, "grade", PAPER_LIMITS.grade, errors);
  const subject = validateIdentifier(body.subject, "subject", PAPER_LIMITS.subject, errors);
  const examId = validateIdentifier(body.examId, "examId", PAPER_LIMITS.examId, errors);
  const submissionType = normalizeRequiredText(body.submissionType);
  const requestId = normalizeRequiredText(body.requestId);

  if (!PAPER_SUBMISSION_TYPES.includes(submissionType)) {
    errors.push(fieldError("submissionType", "INVALID_SUBMISSION_TYPE", "Submission type is invalid."));
  }
  if (!REQUEST_ID_PATTERN.test(requestId) || isSpreadsheetFormulaLike(body.requestId)) {
    errors.push(fieldError("requestId", "INVALID_REQUEST_ID", "Submission request ID is invalid."));
  }

  let fileUrl = "";
  let textContent = "";
  if (submissionType === "Direct Text") {
    if (typeof body.textContent !== "string" || !body.textContent.trim()) {
      errors.push(fieldError("textContent", "REQUIRED", "Question paper text is required."));
    } else if (body.textContent.length > PAPER_LIMITS.textContent) {
      errors.push(fieldError("textContent", "TOO_LONG", "Question paper text is too long."));
    } else {
      textContent = body.textContent;
    }
    if (body.fileUrl !== undefined && body.fileUrl !== null && String(body.fileUrl).trim()) {
      errors.push(fieldError("fileUrl", "UNEXPECTED_FIELD", "A direct-text submission cannot include a paper URL."));
    }
  } else if (submissionType === "File Upload") {
    fileUrl = validateHttpsUrl(body.fileUrl, errors);
    if (body.textContent !== undefined && body.textContent !== null && String(body.textContent).trim()) {
      errors.push(fieldError("textContent", "UNEXPECTED_FIELD", "A file submission cannot include paper text."));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    value: errors.length === 0
      ? { grade, subject, examId, submissionType, requestId, fileUrl, textContent }
      : null,
  };
}

export function validatePaperReview(body, existingPaper) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errors: [fieldError("body", "INVALID_BODY", "Request body must be an object.")],
      value: null,
    };
  }

  const errors = [];
  const submissionId = normalizeRequiredText(body.submissionId);
  const status = normalizeRequiredText(body.status);
  const adminFeedback = body.adminFeedback === undefined || body.adminFeedback === null
    ? ""
    : typeof body.adminFeedback === "string"
    ? body.adminFeedback.trim()
    : null;

  if (!SUBMISSION_ID_PATTERN.test(submissionId) || isSpreadsheetFormulaLike(body.submissionId)) {
    errors.push(fieldError("submissionId", "INVALID_SUBMISSION_ID", "Submission ID is invalid."));
  }
  if (!PAPER_REVIEW_STATUSES.includes(status) || status === "Pending") {
    errors.push(fieldError("status", "INVALID_STATUS", "Review status is invalid."));
  }
  if (adminFeedback === null) {
    errors.push(fieldError("adminFeedback", "INVALID_TYPE", "Review feedback must be text."));
  } else if (adminFeedback.length > PAPER_LIMITS.adminFeedback) {
    errors.push(fieldError("adminFeedback", "TOO_LONG", "Review feedback is too long."));
  }

  const currentStatus = normalizeRequiredText(existingPaper?.Status);
  const currentFeedback = String(existingPaper?.Admin_Feedback ?? "");
  let idempotent = false;
  if (!PAPER_REVIEW_STATUSES.includes(currentStatus)) {
    errors.push(fieldError("status", "INVALID_CURRENT_STATUS", "The stored review status is invalid."));
  } else if (status === currentStatus) {
    if (adminFeedback === currentFeedback) idempotent = true;
    else errors.push(fieldError("status", "INVALID_STATUS_TRANSITION", "This review decision is final."));
  } else if (currentStatus !== "Pending") {
    errors.push(fieldError("status", "INVALID_STATUS_TRANSITION", "This review decision is final."));
  }

  return {
    valid: errors.length === 0,
    errors,
    value: errors.length === 0
      ? { submissionId, status, adminFeedback, currentStatus, idempotent }
      : null,
  };
}

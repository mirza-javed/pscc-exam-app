import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent, serializeErrorForLog } from "@/lib/requestContext.mjs";
import { validateSameOrigin } from "@/lib/requestForgery.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import {
  appendQuestionPaper,
  loadFreshDatabaseTabs,
  SheetWriteError,
  updateQuestionPaperStatus,
} from "@/lib/googleSheets";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth";
import {
  buildUniqueIndex,
  canReviewPaper,
  canSubmitPaper,
  normalizeValue,
} from "@/lib/authorization.mjs";
import {
  validatePaperReview,
  validatePaperSubmission,
} from "@/lib/paperValidation.mjs";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";

export const dynamic = "force-dynamic";

function requestBodyErrorResponse(error, requestId) {
  return apiError({ requestId, status: error.status, error: error.message, code: error.code });
}

function validationErrorResponse(code, errors, requestId, status = 422) {
  return apiError({ requestId, status, error: "Request validation failed.", code, details: errors });
}

async function beginWriteRequest(request, context, policyName, publicServiceName) {
  if (!validateSameOrigin(request).valid) {
    logApiEvent("warn", "request_origin_rejected", context, { status: 403 });
    return { response: apiError({ requestId: context.requestId, status: 403, error: "This request did not come from an allowed origin.", code: "REQUEST_ORIGIN_REJECTED" }) };
  }
  const authenticatedEmail = await getAuthenticatedEmail();
  const limit = await checkRateLimit({ policyName, identifierKind: authenticatedEmail ? "email" : "ip", identifierValue: authenticatedEmail || getClientIp(request), context });
  if (!limit.configured) {
    return { response: apiError({ requestId: context.requestId, status: 503, error: `${publicServiceName} is temporarily unavailable.`, code: "RATE_LIMIT_CONFIGURATION_ERROR" }) };
  }
  if (!limit.allowed) {
    return { response: apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } }) };
  }
  const current = await getCurrentStaff(authenticatedEmail);
  if (!current) {
    logApiEvent("warn", "authentication_denied", context, { status: 401, actorRef: limit.actorRef });
    return { response: apiError({ requestId: context.requestId, status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" }) };
  }
  if (!current.permissions.recognizedRole) {
    logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "unrecognized_role" });
    return { response: apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to use this service.", code: "FORBIDDEN" }) };
  }
  return { current, limit };
}

export async function POST(request) {
  const context = createRequestContext(request, "/api/question-papers");
  let current = null;
  let limit = null;
  try {
    const started = await beginWriteRequest(request, context, "paperSubmit", "Question paper service");
    if (started.response) return started.response;
    ({ current, limit } = started);
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return requestBodyErrorResponse(error, context.requestId);
      throw error;
    }

    const validation = validatePaperSubmission(body);
    if (!validation.valid) {
      return validationErrorResponse("PAPER_VALIDATION_FAILED", validation.errors, context.requestId);
    }
    const { grade, subject, examId, submissionType, requestId, fileUrl, textContent } = validation.value;

    if (!canSubmitPaper(current.permissions, grade, subject)) {
      logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "paper_submit_scope" });
      return apiError({ requestId: context.requestId, status: 403, error: "The paper is outside your authorized teaching scope.", code: "PAPER_SCOPE_FORBIDDEN" });
    }

    const submissionId = `QP-${requestId}`;

    const record = {
      Submission_ID: submissionId,
      Submitted_At: new Date().toISOString().replace("T", " ").substring(0, 16),
      Teacher_Name: current.staff.Full_Name || current.staff.Name || "Faculty Member",
      Grade: String(grade),
      Subject: String(subject),
      Exam_ID: String(examId),
      Submission_Type: submissionType || "Direct Text",
      File_URL: fileUrl || "",
      Text_Content: textContent || "",
      Status: "Pending",
      Admin_Feedback: "",
      Submitted_By_Teacher_ID: current.staff.Teacher_ID,
    };

    const result = await appendQuestionPaper(record);

    return apiJson({
      success: true,
      submissionId,
      idempotent: result.idempotent,
      message: "Question paper successfully submitted for academic review.",
    }, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
  } catch (error) {
    if (error instanceof SheetWriteError && error.code === "SUBMISSION_ID_CONFLICT") {
      logApiEvent("warn", "paper_submission_conflict", context, { status: 409, ...serializeErrorForLog(error) });
      return apiError({ requestId: context.requestId, status: 409, error: "This submission request conflicts with an existing record.", code: error.code });
    }
    return unexpectedApiError({ context, event: "paper_submission_failed", error, publicMessage: "Unable to submit the question paper at this time.", code: "PAPER_SUBMISSION_FAILED" });
  }
}

export async function PATCH(request) {
  const context = createRequestContext(request, "/api/question-papers");
  let current = null;
  let limit = null;
  try {
    const started = await beginWriteRequest(request, context, "paperReview", "Question paper review service");
    if (started.response) return started.response;
    ({ current, limit } = started);
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return requestBodyErrorResponse(error, context.requestId);
      throw error;
    }

    const db = await loadFreshDatabaseTabs(["Question_Papers_Log"]);
    const papers = buildUniqueIndex(db.Question_Papers_Log || [], "Submission_ID");
    const submissionKey = normalizeValue(body?.submissionId);
    const paper = papers.unique.get(submissionKey);
    if (!paper || papers.ambiguous.has(submissionKey)) {
      return apiError({ requestId: context.requestId, status: 404, error: "Submission record not found in database.", code: "PAPER_NOT_FOUND" });
    }
    if (!canReviewPaper(current.permissions, paper)) {
      logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "paper_review_scope" });
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to review this paper.", code: "FORBIDDEN" });
    }

    const validation = validatePaperReview(body, paper);
    if (!validation.valid) {
      const transitionError = validation.errors.some((error) =>
        ["INVALID_STATUS_TRANSITION", "INVALID_CURRENT_STATUS"].includes(error.code)
      );
      return validationErrorResponse(
        transitionError ? "INVALID_STATUS_TRANSITION" : "PAPER_REVIEW_VALIDATION_FAILED",
        validation.errors,
        context.requestId,
        transitionError ? 409 : 422
      );
    }
    const { submissionId, status, adminFeedback } = validation.value;

    const result = await updateQuestionPaperStatus(
      submissionId,
      status,
      adminFeedback,
      paper
    );

    if (!result.found) {
      return apiError({ requestId: context.requestId, status: 404, error: "Submission record not found in database.", code: "PAPER_NOT_FOUND" });
    }

    return apiJson({
      success: true,
      idempotent: result.idempotent,
      message: `Submission status updated to '${status}'.`,
    }, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
  } catch (error) {
    if (
      error instanceof SheetWriteError &&
      ["PAPER_CHANGED", "INVALID_STATUS_TRANSITION"].includes(error.code)
    ) {
      logApiEvent("warn", "paper_review_conflict", context, { status: 409, ...serializeErrorForLog(error) });
      return apiError({ requestId: context.requestId, status: 409, error: "The paper changed before this review could be saved. Refresh and try again.", code: error.code });
    }
    return unexpectedApiError({ context, event: "paper_review_failed", error, publicMessage: "Unable to update the paper review at this time.", code: "PAPER_REVIEW_FAILED" });
  }
}

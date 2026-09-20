import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { validateSameOrigin } from "@/lib/requestForgery.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import { loadFreshDatabaseTabs, saveOrUpdateMarksLog } from "@/lib/googleSheets";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth";
import {
  authorizeMarksBatch,
} from "@/lib/authorization.mjs";
import { validateMarksSubmission } from "@/lib/marksValidation.mjs";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";

export const dynamic = "force-dynamic";

function buildAuthorizationRecords(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.records)) return null;
  const examId = typeof body.examId === "string" || typeof body.examId === "number"
    ? String(body.examId).trim()
    : "";
  const subject = typeof body.subject === "string" || typeof body.subject === "number"
    ? String(body.subject).trim()
    : "";
  if (!examId || !subject || body.records.length === 0) return null;

  const records = [];
  for (const item of body.records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const rawKitNo = item.Kit_No ?? item.Student_ID;
    if (typeof rawKitNo !== "string" && typeof rawKitNo !== "number") return null;
    const kitNo = String(rawKitNo).trim();
    if (!kitNo) return null;
    const candidateSubmissionId =
      typeof item.Submission_ID === "string" ? item.Submission_ID.trim() : "";
    records.push({
      Submission_ID: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidateSubmissionId)
        ? candidateSubmissionId
        : "",
      Kit_No: kitNo,
      Exam_ID: examId,
      Subject: subject,
    });
  }
  return records;
}

export async function POST(request) {
  const context = createRequestContext(request, "/api/marks");
  try {
    if (!validateSameOrigin(request).valid) {
      logApiEvent("warn", "request_origin_rejected", context, { status: 403 });
      return apiError({ requestId: context.requestId, status: 403, error: "This request did not come from an allowed origin.", code: "REQUEST_ORIGIN_REJECTED" });
    }
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({ policyName: "marksWrite", identifierKind: authenticatedEmail ? "email" : "ip", identifierValue: authenticatedEmail || getClientIp(request), context });
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Marks service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
    }
    if (!limit.allowed) {
      return apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } });
    }
    const current = await getCurrentStaff(authenticatedEmail);
    if (!current) {
      logApiEvent("warn", "authentication_denied", context, { status: 401, actorRef: limit.actorRef });
      return apiError({ requestId: context.requestId, status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    }
    if (!current.permissions.recognizedRole) {
      logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "unrecognized_role" });
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to save marks.", code: "FORBIDDEN" });
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (!(error instanceof RequestBodyError)) throw error;
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code });
    }

    const db = await loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme"]);
    const authorizationRecords = buildAuthorizationRecords(body);
    if (authorizationRecords) {
      const authorization = authorizeMarksBatch(current.permissions, authorizationRecords, db);
      if (!authorization.authorized) {
        logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "marks_scope" });
        return apiError({ requestId: context.requestId, status: 403, error: "Marks are outside your authorized teaching scope.", code: "MARKS_SCOPE_FORBIDDEN" });
      }
    }

    const validation = validateMarksSubmission(body, db);
    if (!validation.valid) {
      return apiError({ requestId: context.requestId, status: 422, error: "Marks submission contains validation errors.", code: "MARKS_VALIDATION_FAILED", details: validation.errors });
    }

    // Structurally valid requests always produce authorization records above.
    // This defensive check prevents future schema changes from bypassing scope enforcement.
    if (!authorizationRecords) {
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to save marks.", code: "FORBIDDEN" });
    }

    const result = await saveOrUpdateMarksLog(validation.records);

    const message =
      result.updatedCount > 0 && result.insertedCount > 0
        ? `Successfully updated ${result.updatedCount} marks and added ${result.insertedCount} new entries in Master Database.`
        : result.updatedCount > 0
        ? `Successfully updated ${result.updatedCount} student marks in the Master Database (previous Submission IDs preserved).`
        : `Successfully recorded ${result.insertedCount} student marks to the Master Database.`;

    return apiJson({
      success: true,
      count: result.totalCount,
      updatedCount: result.updatedCount,
      insertedCount: result.insertedCount,
      message,
    }, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
  } catch (error) {
    return unexpectedApiError({ context, event: "marks_write_failed", error, publicMessage: "Unable to save marks at this time.", code: "MARKS_SAVE_FAILED" });
  }
}

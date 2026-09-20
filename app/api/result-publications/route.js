import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent, serializeErrorForLog } from "@/lib/requestContext.mjs";
import { validateSameOrigin } from "@/lib/requestForgery.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import {
  appendResultPublicationEvent,
  loadFreshDatabaseTabs,
  loadMasterDatabase,
  SheetWriteError,
} from "@/lib/googleSheets";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { ALL_EXAMS, RESULT_POLICY_VERSION } from "@/lib/examinationResults.mjs";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["Draft", "Published", "Revised"]);

function requiredText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export async function POST(request) {
  const context = createRequestContext(request, "/api/result-publications");
  try {
    if (!validateSameOrigin(request).valid) {
      logApiEvent("warn", "request_origin_rejected", context, { status: 403 });
      return apiError({ requestId: context.requestId, status: 403, error: "This request did not come from an allowed origin.", code: "REQUEST_ORIGIN_REJECTED" });
    }
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({ policyName: "resultPublication", identifierKind: authenticatedEmail ? "email" : "ip", identifierValue: authenticatedEmail || getClientIp(request), context });
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Result publication service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
    }
    if (!limit.allowed) {
      return apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } });
    }
    const current = await getCurrentStaff(authenticatedEmail);
    if (!current) {
      logApiEvent("warn", "authentication_denied", context, { status: 401, actorRef: limit.actorRef });
      return apiError({ requestId: context.requestId, status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    }
    if (!current.permissions.canWriteAllMarks) {
      logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "result_publication_scope" });
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to publish results.", code: "FORBIDDEN" });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (!(error instanceof RequestBodyError)) throw error;
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code });
    }

    const grade = requiredText(body?.grade);
    const section = requiredText(body?.section);
    const kitNo = requiredText(body?.kitNo);
    const academicSession = requiredText(body?.academicSession);
    const examId = requiredText(body?.examId);
    const status = requiredText(body?.status);
    const revisionReason = requiredText(body?.revisionReason);
    if (!grade || !section || !kitNo || !examId || !STATUSES.has(status)) {
      return apiError({ requestId: context.requestId, status: 422, error: "Publication request is invalid.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (examId === ALL_EXAMS && !academicSession) {
      return apiError({ requestId: context.requestId, status: 422, error: "Academic Session/Year is required for All Exams.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (status === "Revised" && !revisionReason) {
      return apiError({ requestId: context.requestId, status: 422, error: "Revision reason is required.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (revisionReason.length > 2000) {
      return apiError({ requestId: context.requestId, status: 422, error: "Revision reason must not exceed 2,000 characters.", code: "PUBLICATION_VALIDATION_FAILED" });
    }

    const [master, fresh] = await Promise.all([
      loadMasterDatabase(false),
      loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme", "Grading_System", "Result_Publications"]),
    ]);
    const db = { ...master, ...fresh };
    const analytics = buildClassAnalyticsData(db, grade, section, examId, academicSession);
    const result = analytics.meritGrid.find((cadet) => String(cadet.Kit_No) === kitNo);
    if (!result) {
      return apiError({ requestId: context.requestId, status: 404, error: "Result was not found in the authorized academic data.", code: "RESULT_NOT_FOUND" });
    }
    if (status !== "Draft" && !result.isFinal) {
      return apiError({ requestId: context.requestId, status: 422, error: "Only complete and valid results can be published.", code: "RESULT_NOT_FINAL" });
    }

    const previousEvents = (db.Result_Publications || []).filter(
      (event) => String(event.Result_Key || "").trim().toLowerCase() === result.resultKey.toLowerCase()
    );
    const officialEvents = previousEvents.filter((event) =>
      ["published", "revised"].includes(String(event.Result_Status || "").trim().toLowerCase())
    );
    const previousOfficial = officialEvents.at(-1) || null;
    const identical = previousEvents.find((event) =>
      event.Result_Status === status && event.Calculation_Fingerprint === result.calculationFingerprint
    );
    if (identical) {
      return apiJson({ success: true, idempotent: true, event: identical }, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
    }
    if (status === "Published" && previousOfficial) {
      return apiError({ requestId: context.requestId, status: 409, error: "A published result already exists; use Revised with a reason.", code: "RESULT_ALREADY_PUBLISHED" });
    }
    if (status === "Revised") {
      if (!previousOfficial) {
        return apiError({ requestId: context.requestId, status: 409, error: "A result cannot be revised before it is published.", code: "RESULT_NOT_PUBLISHED" });
      }
      if (previousOfficial.Calculation_Fingerprint === result.calculationFingerprint) {
        return apiError({ requestId: context.requestId, status: 409, error: "The calculated result has not changed.", code: "RESULT_UNCHANGED" });
      }
    }

    const event = {
      Publication_Event_ID: `RPE-${crypto.randomUUID()}`,
      Result_Key: result.resultKey,
      Kit_No: result.Kit_No,
      Grade: grade,
      Section: section,
      Academic_Session: result.academicSession,
      Result_Scope: examId === ALL_EXAMS ? "All Exams" : "Single Exam",
      Exam_ID: examId === ALL_EXAMS ? "" : examId,
      Result_Status: status,
      Calculation_Fingerprint: result.calculationFingerprint,
      Policy_Version: RESULT_POLICY_VERSION,
      Recorded_At: new Date().toISOString(),
      Recorded_By: current.staff.Teacher_ID || current.staff.Email,
      Prior_Event_ID: previousOfficial?.Publication_Event_ID || "",
      Revision_Reason: status === "Revised" ? revisionReason : "",
    };
    const stored = await appendResultPublicationEvent(event);
    return apiJson({ success: true, ...stored, event }, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
  } catch (error) {
    if (error instanceof SheetWriteError && ["PUBLICATION_EVENT_CONFLICT", "INVALID_PUBLICATION_TRANSITION", "UNCHANGED_PUBLICATION"].includes(error.code)) {
      logApiEvent("warn", "result_publication_conflict", context, { status: 409, ...serializeErrorForLog(error) });
      return apiError({ requestId: context.requestId, status: 409, error: "The result publication conflicts with a newer stored state. Refresh and try again.", code: error.code });
    }
    return unexpectedApiError({ context, event: "result_publication_failed", error, publicMessage: "Unable to record result publication.", code: "RESULT_PUBLICATION_FAILED" });
  }
}

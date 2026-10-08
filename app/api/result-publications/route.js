import { SheetWriteError } from "@/lib/repositories/sheetRows.mjs";
import { recordResultPublication } from "@/lib/services/resultPublicationService.mjs";
import { ServiceError } from "@/lib/services/serviceError.mjs";
import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent, serializeErrorForLog } from "@/lib/requestContext.mjs";
import { validateSameOrigin } from "@/lib/requestForgery.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const context = createRequestContext(request, "/api/result-publications");
  let limitActorRef;
  try {
    if (!validateSameOrigin(request).valid) {
      logApiEvent("warn", "request_origin_rejected", context, { status: 403 });
      return apiError({ requestId: context.requestId, status: 403, error: "This request did not come from an allowed origin.", code: "REQUEST_ORIGIN_REJECTED" });
    }
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({ policyName: "resultPublication", identifierKind: authenticatedEmail ? "email" : "ip", identifierValue: authenticatedEmail || getClientIp(request), context });
    limitActorRef = limit.actorRef;
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
      logApiEvent("warn", "mutation.body_rejected", context, { status: error.status, code: error.code });
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code });
    }

    const payload = await recordResultPublication(current, body, context);
    return apiJson({ ...payload, requestId: context.requestId }, { requestId: context.requestId, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) } });
  } catch (error) {
    if (error instanceof ServiceError) {
      logApiEvent("warn", "publication.write_rejected", context, { status: error.status, code: error.code });
      if (error.reason) logApiEvent("warn", "authorization_denied", context, { status: error.status, actorRef: limitActorRef, reason: error.reason });
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code, details: error.details,
        headers: ["WRITE_BUSY", "WRITE_UNKNOWN_OUTCOME", "WRITE_COORDINATION_UNAVAILABLE"].includes(error.code) ? { "Retry-After": "2" } : {} });
    }
    if (error instanceof SheetWriteError && ["PUBLICATION_EVENT_CONFLICT", "INVALID_PUBLICATION_TRANSITION", "UNCHANGED_PUBLICATION"].includes(error.code)) {
      logApiEvent("warn", "result_publication_conflict", context, { status: 409, ...serializeErrorForLog(error) });
      return apiError({ requestId: context.requestId, status: 409, error: "The result publication conflicts with a newer stored state. Refresh and try again.", code: error.code });
    }
    return unexpectedApiError({ context, event: "result_publication_failed", error, publicMessage: "Unable to record result publication.", code: "RESULT_PUBLICATION_FAILED" });
  }
}

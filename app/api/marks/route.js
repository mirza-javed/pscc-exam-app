import { submitMarks } from "@/lib/services/marksService.mjs";
import { ServiceError } from "@/lib/services/serviceError.mjs";
import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { validateSameOrigin } from "@/lib/requestForgery.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const context = createRequestContext(request, "/api/marks");
  let limitActorRef;
  try {
    if (!validateSameOrigin(request).valid) {
      logApiEvent("warn", "request_origin_rejected", context, { status: 403 });
      return apiError({ requestId: context.requestId, status: 403, error: "This request did not come from an allowed origin.", code: "REQUEST_ORIGIN_REJECTED" });
    }
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({ policyName: "marksWrite", identifierKind: authenticatedEmail ? "email" : "ip", identifierValue: authenticatedEmail || getClientIp(request), context });
    limitActorRef = limit.actorRef;
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

    const payload = await submitMarks(current, body);
    return apiJson(payload, { requestId: context.requestId, headers: rateLimitHeaders(limit) });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.reason) logApiEvent("warn", "authorization_denied", context, { status: error.status, actorRef: limitActorRef, reason: error.reason });
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code, details: error.details });
    }
    return unexpectedApiError({ context, event: "marks_write_failed", error, publicMessage: "Unable to save marks at this time.", code: "MARKS_SAVE_FAILED" });
  }
}

import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import { getAuthenticatedEmail, getCurrentStaff, getPublicCurrentStaff } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = createRequestContext(request, "/api/staff-session");
  try {
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({
      policyName: "staffSession",
      identifierKind: authenticatedEmail ? "email" : "ip",
      identifierValue: authenticatedEmail || getClientIp(request),
      context,
    });
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Session service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
    }
    if (!limit.allowed) {
      return apiError({
        requestId: context.requestId,
        status: 429,
        error: limit.policy.message,
        code: "RATE_LIMITED",
        headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) },
      });
    }
    const current = await getCurrentStaff(authenticatedEmail);
    if (!current) {
      logApiEvent("warn", "authentication_denied", context, { status: 401, actorRef: limit.actorRef });
      return apiError({ requestId: context.requestId, status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    }
    return apiJson({
      success: true,
      user: getPublicCurrentStaff(current.staff),
      permissions: current.permissions,
    }, {
      requestId: context.requestId,
      headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(limit) },
    });
  } catch (error) {
    return unexpectedApiError({ context, event: "staff_session_failed", error, publicMessage: "Unable to load the staff session.", code: "STAFF_SESSION_FAILED" });
  }
}

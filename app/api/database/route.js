import { getAcademicData } from "@/lib/services/academicDataService.mjs";
import { ServiceError } from "@/lib/services/serviceError.mjs";
import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import {
  getAuthenticatedEmail,
  getCurrentStaff,
} from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = createRequestContext(request, "/api/database");
  let limitActorRef;
  try {
    const { searchParams } = new URL(request.url);
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({
      policyName: searchParams.get("refresh") === "true" ? "databaseRefresh" : "databaseRead",
      identifierKind: authenticatedEmail ? "email" : "ip",
      identifierValue: authenticatedEmail || getClientIp(request),
      context,
    });
    limitActorRef = limit.actorRef;
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Data service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
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
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to access this resource.", code: "FORBIDDEN" });
    }
    const payload = await getAcademicData(current, searchParams);
    return apiJson(payload, { requestId: context.requestId, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(limit) } });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.reason) logApiEvent("warn", "authorization_denied", context, { status: error.status, actorRef: limitActorRef, reason: error.reason });
      return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code, details: error.details });
    }
    return unexpectedApiError({ context, event: "database_read_failed", error, publicMessage: "Unable to load academic data at this time.", code: "DATABASE_READ_FAILED" });
  }
}

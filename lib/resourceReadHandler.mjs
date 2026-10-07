import { getResource } from "./services/resourceReadService.mjs";
import { ServiceError } from "./services/serviceError.mjs";
import { apiJson, apiError, unexpectedApiError } from "./apiErrors.mjs";
import { createRequestContext, logApiEvent } from "./requestContext.mjs";
import { getAuthenticatedEmail, getCurrentStaff } from "./staffAuth.js";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "./rateLimit.mjs";

export function resourceReadHandler(resource, path) {
  return async function GET(request) {
    const context = createRequestContext(request, path);
    try {
      const email = await getAuthenticatedEmail();
      const params = new URL(request.url).searchParams;
      const limit = await checkRateLimit({ policyName: resource === "config" && params.get("refresh") === "true" ? "databaseRefresh" : "scopedRead",
        identifierKind: email ? "email" : "ip", identifierValue: email || getClientIp(request), context });
      if (!limit.configured) return apiError({ requestId: context.requestId, status: 503, error: "Data service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR", headers: { "Cache-Control": "private, no-store" } });
      if (!limit.allowed) return apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } });
      const current = await getCurrentStaff(email);
      const payload = await getResource(resource, current, params);
      return apiJson({ ...payload, requestId: context.requestId }, { requestId: context.requestId, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(limit) } });
    } catch (error) {
      if (error instanceof ServiceError) {
        if ([401, 403].includes(error.status)) logApiEvent("warn", "scoped_read_denied", context, { status: error.status, code: error.code, headers: { "Cache-Control": "private, no-store" } });
        return apiError({ requestId: context.requestId, status: error.status, error: error.message, code: error.code, headers: { "Cache-Control": "private, no-store" } });
      }
      const response = unexpectedApiError({ context, event: "scoped_read_failed", error, publicMessage: "Unable to load academic data at this time.", code: "RESOURCE_READ_FAILED" });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  };
}

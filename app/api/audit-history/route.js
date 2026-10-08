import { readAuditHistory } from "@/lib/services/auditService.mjs";
import { ServiceError } from "@/lib/services/serviceError.mjs";
import { apiJson, apiError, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { getAuthenticatedEmail, getCurrentStaff } from "@/lib/staffAuth.js";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
  retryAfterSeconds,
} from "@/lib/rateLimit.mjs";

export const dynamic = "force-dynamic";
export async function GET(request) {
  const context = createRequestContext(request, "/api/audit-history");
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const email = await getAuthenticatedEmail();
    const limit = await checkRateLimit({
      policyName: "scopedRead",
      identifierKind: email ? "email" : "ip",
      identifierValue: email || getClientIp(request),
      context,
    });
    if (!limit.configured)
      return apiError({
        requestId: context.requestId,
        status: 503,
        error: "Audit service is temporarily unavailable.",
        code: "RATE_LIMIT_CONFIGURATION_ERROR",
        headers,
      });
    if (!limit.allowed)
      return apiError({
        requestId: context.requestId,
        status: 429,
        error: limit.policy.message,
        code: "RATE_LIMITED",
        headers: {
          ...headers,
          ...rateLimitHeaders(limit),
          "Retry-After": retryAfterSeconds(limit),
        },
      });
    const current = await getCurrentStaff(email);
    const payload = await readAuditHistory(
      current,
      new URL(request.url).searchParams,
    );
    return apiJson(
      { ...payload, requestId: context.requestId },
      {
        requestId: context.requestId,
        headers: { ...headers, ...rateLimitHeaders(limit) },
      },
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      logApiEvent("warn", "audit.read_denied_or_failed", context, {
        code: error.code,
        status: error.status,
      });
      return apiError({
        requestId: context.requestId,
        status: error.status,
        code: error.code,
        error: error.message,
        headers,
      });
    }
    const response = unexpectedApiError({
      context,
      event: "audit.read_failed",
      error,
      publicMessage: "Unable to load audit history.",
      code: "AUDIT_READ_FAILED",
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

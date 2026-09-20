import { handlers, runWithAuthRequestContext } from "@/auth";
import { apiError } from "@/lib/apiErrors.mjs";
import { attachRequestId, createRequestContext } from "@/lib/requestContext.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";

async function runAuthHandler(handler, request, context) {
  const state = { context, securityFailure: null };
  const response = await runWithAuthRequestContext(state, () => handler(request));
  if (state.securityFailure && !state.securityFailure.configured) {
    return apiError({ requestId: context.requestId, status: 503, error: "Sign-in is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
  }
  if (state.securityFailure && !state.securityFailure.allowed) {
    return apiError({
      requestId: context.requestId,
      status: 429,
      error: state.securityFailure.policy.message,
      code: "RATE_LIMITED",
      headers: {
        ...rateLimitHeaders(state.securityFailure),
        "Retry-After": retryAfterSeconds(state.securityFailure),
      },
    });
  }
  return attachRequestId(response, context.requestId);
}

export async function GET(request) {
  const context = createRequestContext(request, "/api/auth/[...nextauth]");
  return runAuthHandler(handlers.GET, request, context);
}

export async function POST(request) {
  const context = createRequestContext(request, "/api/auth/[...nextauth]");
  const pathname = new URL(request.url).pathname;
  if (/\/api\/auth\/signin(?:\/|$)/.test(pathname)) {
    const limit = await checkRateLimit({
      policyName: "authSignIn",
      identifierKind: "ip",
      identifierValue: getClientIp(request),
      context,
    });
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Sign-in is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
    }
    if (!limit.allowed) {
      return apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } });
    }
  }
  return runAuthHandler(handlers.POST, request, context);
}

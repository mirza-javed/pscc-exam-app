import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const LOG_TEXT_LIMIT = 2000;

function cleanRequestId(value) {
  const candidate = String(value || "").trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : "";
}

export function createRequestId(request) {
  return cleanRequestId(request?.headers?.get?.("x-request-id")) || randomUUID();
}

export function createRequestContext(request, route) {
  return {
    requestId: createRequestId(request),
    route,
    method: request?.method || "UNKNOWN",
  };
}

export function attachRequestId(response, requestId, additionalHeaders = {}) {
  response.headers.set("X-Request-ID", requestId);
  for (const [name, value] of Object.entries(additionalHeaders)) {
    if (value !== undefined && value !== null && value !== "") {
      response.headers.set(name, String(value));
    }
  }
  return response;
}

function sanitizeLogText(value) {
  return String(value || "")
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(AUTH_SECRET|RATE_LIMIT_HASH_SECRET|GCP_PRIVATE_KEY|GCP_CLIENT_EMAIL|AUTH_GOOGLE_SECRET|UPSTASH_REDIS_REST_TOKEN)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:key|token|secret|signature|code)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .slice(0, LOG_TEXT_LIMIT);
}

export function serializeErrorForLog(error) {
  if (!error || typeof error !== "object") {
    return { name: "Error", message: sanitizeLogText(error) };
  }
  const upstreamStatus = Number(error?.response?.status || error?.status || 0) || undefined;
  return {
    name: sanitizeLogText(error.name || "Error"),
    code: sanitizeLogText(error.code || "") || undefined,
    upstreamStatus,
    message: sanitizeLogText(error.message || "Unexpected server error."),
  };
}

function cleanLogFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).filter(([, value]) =>
      value !== undefined && value !== null && ["string", "number", "boolean"].includes(typeof value)
    ).map(([key, value]) => [key, typeof value === "string" ? sanitizeLogText(value) : value])
  );
}

export function logApiEvent(level, event, context = {}, fields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    ...cleanLogFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

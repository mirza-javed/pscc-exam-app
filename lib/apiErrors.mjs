import { attachRequestId, logApiEvent, serializeErrorForLog } from "./requestContext.mjs";

export function apiJson(payload, { status = 200, headers = {}, requestId } = {}) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }
  const response = new Response(JSON.stringify(payload), { status, headers: responseHeaders });
  return requestId ? attachRequestId(response, requestId) : response;
}

export function apiError({
  requestId,
  status,
  error,
  code,
  details,
  headers = {},
}) {
  return apiJson({
    success: false,
    error,
    code,
    requestId,
    ...(details === undefined ? {} : { details }),
  }, { status, headers, requestId });
}

export function unexpectedApiError({
  context,
  event,
  error,
  publicMessage,
  code,
  fields = {},
}) {
  logApiEvent("error", event, context, {
    ...fields,
    status: 500,
    ...serializeErrorForLog(error),
  });
  return apiError({
    requestId: context.requestId,
    status: 500,
    error: publicMessage,
    code,
  });
}

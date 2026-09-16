export const DEFAULT_WRITE_BODY_LIMIT_BYTES = 256 * 1024;

export class RequestBodyError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "RequestBodyError";
    this.code = code;
    this.status = status;
  }
}

export async function readJsonBody(request, maxBytes = DEFAULT_WRITE_BODY_LIMIT_BYTES) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestBodyError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
      415
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      throw new RequestBodyError("INVALID_CONTENT_LENGTH", "Invalid request size.", 400);
    }
    if (declaredLength > maxBytes) {
      throw new RequestBodyError("PAYLOAD_TOO_LARGE", "Request payload is too large.", 413);
    }
  }

  if (!request.body) {
    throw new RequestBodyError("INVALID_JSON", "Invalid JSON request body.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("PAYLOAD_TOO_LARGE", "Request payload is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("INVALID_BODY", "Unable to read request body.", 400);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError("INVALID_JSON", "Invalid JSON request body.", 400);
  }
}

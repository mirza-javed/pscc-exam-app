const resources = {
  config: { path: "/api/academic-config", keys: ["grade", "academicSession", "examId", "refresh"] },
  students: { path: "/api/students", keys: ["grade", "section", "kitNo", "search", "limit", "cursor"] },
  marks: { path: "/api/marks", keys: ["grade", "section", "kitNo", "examId", "academicSession", "subject", "limit", "cursor"] },
  analytics: { path: "/api/analytics-data", keys: ["grade", "section", "academicSession", "examId"] },
};
export class ApiClientError extends Error {
  constructor(message, status, code, requestId) {
    super(`${message}${requestId ? ` (Reference: ${requestId})` : ""}`);
    Object.assign(this, { status, code, requestId });
  }
}
export async function readAcademicResource(resource, query = {}, { signal, fetchImpl = globalThis.fetch } = {}) {
  const definition = resources[resource];
  if (!definition) throw new Error("Unknown academic resource.");
  const allowed = new Set([...definition.keys, "previewTeacherId"]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key)) throw new Error("Unsupported academic query parameter.");
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  const response = await fetchImpl(`${definition.path}${encoded ? `?${encoded}` : ""}`, { cache: "no-store", signal });
  let payload;
  try { payload = await response.json(); } catch {
    throw new ApiClientError("Unable to read the server response.", response.status, "INVALID_RESPONSE", response.headers?.get("X-Request-ID"));
  }
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : response.headers?.get("X-Request-ID");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiClientError("Unable to read the server response.", response.status, "INVALID_RESPONSE", requestId);
  }
  if (!response.ok || payload.success !== true) {
    throw new ApiClientError(typeof payload.error === "string" ? payload.error : "Unable to load academic data.", response.status, payload.code || "RESOURCE_READ_FAILED", requestId);
  }
  const paginated = resource === "students" || resource === "marks";
  const valid = paginated
    ? Array.isArray(payload.items) && typeof payload.hasMore === "boolean" && (payload.nextCursor === null || typeof payload.nextCursor === "string")
    : payload.data && typeof payload.data === "object" && !Array.isArray(payload.data);
  if (!valid) throw new ApiClientError("Unable to read the server response.", response.status, "INVALID_RESPONSE", requestId);
  return payload;
}

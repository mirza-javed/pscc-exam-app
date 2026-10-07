import { createHash } from "node:crypto";
import { stableJson } from "./writeState.mjs";
import { ServiceError } from "./services/serviceError.mjs";

const filters = {
  config: ["grade", "academicSession", "examId", "refresh"],
  students: ["grade", "section", "kitNo", "search", "limit", "cursor"],
  marks: ["grade", "section", "kitNo", "examId", "academicSession", "subject", "limit", "cursor"],
  analytics: ["grade", "section", "academicSession", "examId"],
};
export function readResourceQuery(resource, params) {
  const allowed = new Set([...filters[resource], "previewTeacherId"]);
  const query = {};
  for (const [key, raw] of params) {
    if (!allowed.has(key) || Object.hasOwn(query, key) || !raw.trim() || raw.length > (key === "cursor" ? 1024 : 160) || /[\u0000-\u001f\u007f]/.test(raw)) {
      throw new ServiceError({ status: 400, error: "Invalid query parameters.", code: "INVALID_QUERY" });
    }
    query[key] = raw.trim();
  }
  if ((query.refresh && !["true", "false"].includes(query.refresh)) ||
      (query.section?.toUpperCase() === "ALL" && !query.grade) ||
      (resource === "analytics" && (!query.grade || !query.section))) {
    throw new ServiceError({ status: 400, error: "Invalid query parameters.", code: "INVALID_QUERY" });
  }
  if (filters[resource].includes("limit")) {
    const max = resource === "students" ? 200 : 1000;
    if (query.limit && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > max)) {
      throw new ServiceError({ status: 400, error: "Invalid page limit.", code: "INVALID_QUERY" });
    }
    query.limit = Number(query.limit || (resource === "students" ? 50 : 250));
  }
  return query;
}

const hash = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
export function paginateResource(rows, query, scope) {
  // Source index breaks duplicate ties without discarding legacy records.
  const items = rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const key = (r) => [r.Grade, r.Section, r.Kit_No || r.Student_ID, r.Exam_ID, r.Subject, r.Submission_ID]
      .map((value) => String(value || "").trim().toLowerCase()).join("\0");
    const left = key(a.row), right = key(b.row);
    return (left < right ? -1 : left > right ? 1 : 0) || a.index - b.index;
  }).map(({ row }) => row);
  const { cursor, ...filters } = query;
  const binding = hash({ scope, filters });
  const revision = hash(items);
  let offset = 0;
  if (cursor) {
    let decoded;
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new ServiceError({ status: 400, error: "Invalid pagination cursor.", code: "INVALID_CURSOR" });
    try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { /* Fail closed below. */ }
    if (!decoded || decoded.binding !== binding || !Number.isSafeInteger(decoded.offset) || decoded.offset <= 0) {
      throw new ServiceError({ status: 400, error: "Invalid pagination cursor.", code: "INVALID_CURSOR" });
    }
    if (decoded.revision !== revision) throw new ServiceError({ status: 409, error: "Data changed. Restart pagination.", code: "PAGINATION_STALE" });
    if (decoded.offset > items.length) throw new ServiceError({ status: 400, error: "Invalid pagination cursor.", code: "INVALID_CURSOR" });
    offset = decoded.offset;
  }
  const end = offset + query.limit;
  const hasMore = end < items.length;
  return { success: true, items: items.slice(offset, end), hasMore,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ binding, revision, offset: end })).toString("base64url") : null };
}

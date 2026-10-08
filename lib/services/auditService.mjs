import "server-only";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { normalizeRole, ROLE_KEYS } from "../authorization.mjs";
import { normalizeWriteKey } from "../domain/identifiers.mjs";
import {
  AUDIT_ACTIONS,
  auditIssues,
  createAuditEvent,
} from "../domain/auditEvents.mjs";
import {
  loadAuditTable,
  auditAppendRequest,
  openAuditReader,
  auditStorageError,
} from "../repositories/auditRepository.js";
import { ServiceError } from "./serviceError.mjs";

const READ_ROLES = new Set([
  ROLE_KEYS.PRINCIPAL,
  ROLE_KEYS.VICE_PRINCIPAL,
  ROLE_KEYS.ADMIN_EXAM,
  ROLE_KEYS.IN_CHARGE_EXAMINATION,
]);
export function canReadAuditHistory(current) {
  return Boolean(
    current?.permissions?.recognizedRole &&
      READ_ROLES.has(normalizeRole(current.staff?.Role)),
  );
}
export function auditIdentity(current, body, context, kind) {
  const actor = String(current?.staff?.Teacher_ID || "").trim();
  const role = normalizeRole(current?.staff?.Role);
  if (!actor || !role || !context?.requestId || !body?.saveId)
    throw auditStorageError("AUDIT_IDENTITY_INVALID");
  return {
    Actor_ID: actor,
    Actor_Role: role,
    Request_ID: context.requestId,
    Save_ID: body.saveId,
    Source: kind === "marks" ? "marksService" : "resultPublicationService",
  };
}
export async function planAudit(storage, identity, changes, now = Date.now()) {
  const table = await loadAuditTable(storage);
  const timestamp = new Date(Math.max(now, table.lastTime + 1)).toISOString();
  let events;
  try {
    events = changes.map((change) =>
      createAuditEvent(identity, change, timestamp),
    );
  } catch {
    throw auditStorageError("AUDIT_EVENT_INVALID");
  }
  if (!events.length) throw auditStorageError("AUDIT_EVENT_REQUIRED");
  return { request: auditAppendRequest(table, events), events };
}
const badQuery = (code = "INVALID_QUERY") =>
  new ServiceError({
    status: 400,
    code,
    error: "Invalid audit-history query.",
  });
const FILTERS = {
  actionType: "Action_Type",
  actorId: "Actor_ID",
  examId: "Exam_ID",
  grade: "Grade",
  section: "Section",
  subject: "Subject",
  kitNo: "Kit_No",
  requestId: "Request_ID",
  saveId: "Save_ID",
  submissionId: "Submission_ID",
};
export function readAuditQuery(params) {
  const query = {};
  for (const [key, value] of params) {
    if (
      !Object.hasOwn(FILTERS, key) &&
      !["from", "to", "limit", "cursor"].includes(key)
    )
      throw badQuery();
    if (
      Object.hasOwn(query, key) ||
      !value.trim() ||
      value.length > (key === "cursor" ? 4096 : 160) ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      throw badQuery();
    query[key] = value.trim();
  }
  if (query.actionType && !AUDIT_ACTIONS.has(query.actionType))
    throw badQuery();
  for (const key of ["from", "to"])
    if (
      query[key] &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(query[key]) ||
        !Number.isFinite(Date.parse(query[key])) ||
        new Date(query[key]).toISOString().replace(".000Z", "Z") !==
          query[key].replace(".000Z", "Z"))
    )
      throw badQuery();
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to))
    throw badQuery();
  if (
    query.limit &&
    (!/^\d+$/.test(query.limit) ||
      Number(query.limit) < 1 ||
      Number(query.limit) > 200)
  )
    throw badQuery();
  query.limit = Number(query.limit || 50);
  return query;
}
function cursorCodec(secret) {
  if (!secret) throw auditStorageError("AUDIT_CURSOR_UNAVAILABLE");
  const key = createHash("sha256")
    .update("audit-cursor-v1:" + secret)
    .digest();
  return {
    encode(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString(
        "base64url",
      );
    },
    decode(value) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(value)) throw badQuery();
        const data = Buffer.from(value, "base64url"),
          decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        return JSON.parse(
          Buffer.concat([
            decipher.update(data.subarray(28)),
            decipher.final(),
          ]).toString(),
        );
      } catch {
        throw badQuery("INVALID_CURSOR");
      }
    },
  };
}
export function createAuditReadService(dependencies = {}) {
  return async function readAudit(current, params) {
    if (!current)
      throw new ServiceError({
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        error: "Authentication is required.",
      });
    if (!canReadAuditHistory(current))
      throw new ServiceError({
        status: 403,
        code: "FORBIDDEN",
        error: "You are not authorized to read audit history.",
      });
    const query = readAuditQuery(params),
      { cursor, ...filters } = query;
    const reader = await (dependencies.openReader || openAuditReader)();
    const codec = cursorCodec(
      dependencies.secret || process.env.WRITE_COORDINATION_SECRET,
    );
    const binding = createHash("sha256")
      .update(
        JSON.stringify([
          reader.binding,
          current.staff.Teacher_ID,
          normalizeRole(current.staff.Role),
          filters,
        ]),
      )
      .digest("hex");
    const state = cursor
      ? codec.decode(cursor)
      : {
          binding,
          high: reader.rowCount,
          next: reader.rowCount,
          anchor: reader.anchor,
        };
    if (
      state.binding !== binding ||
      !Number.isSafeInteger(state.high) ||
      !Number.isSafeInteger(state.next) ||
      state.high < 1 ||
      state.next < 1 ||
      state.next > state.high ||
      state.high > reader.rowCount
    )
      throw badQuery("INVALID_CURSOR");
    if (cursor && state.high >= 2) {
      const anchor = await reader.read(state.high, state.high);
      if (anchor[0]?.event.Audit_ID !== state.anchor)
        throw new ServiceError({
          status: 409,
          code: "PAGINATION_STALE",
          error: "Audit history changed. Restart pagination.",
        });
    }
    const items = [];
    let next = state.next,
      scanned = 0;
    while (next >= 2 && items.length < query.limit && scanned < 5000) {
      const start = Math.max(2, next - 499);
      const rows = await reader.read(start, next);
      const byRow = new Map(rows.map((entry) => [entry.row, entry.event]));
      for (let row = next; row >= start; row--) {
        scanned++;
        next = row - 1;
        const event = byRow.get(row);
        if (!event) continue;
        if (auditIssues(event).length)
          throw auditStorageError("AUDIT_INTEGRITY_INVALID");
        if (query.from && Date.parse(event.Timestamp) < Date.parse(query.from))
          continue;
        if (query.to && Date.parse(event.Timestamp) > Date.parse(query.to))
          continue;
        if (
          Object.entries(FILTERS).some(
            ([filter, field]) =>
              query[filter] &&
              (["Request_ID", "Save_ID", "Submission_ID"].includes(field)
                ? event[field] !== query[filter]
                : normalizeWriteKey(event[field]) !==
                  normalizeWriteKey(query[filter])),
          )
        )
          continue;
        items.push(event);
        if (items.length === query.limit) break;
      }
    }
    const hasMore = next >= 2;
    return {
      success: true,
      items,
      nextCursor: hasMore ? codec.encode({ ...state, next }) : null,
      hasMore,
    };
  };
}
export const readAuditHistory = createAuditReadService();

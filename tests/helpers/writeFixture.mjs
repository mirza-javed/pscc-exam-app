import { AUDIT_HEADERS } from "../../lib/domain/auditEvents.mjs";
import { WRITE_RECEIPT_HEADERS } from "../../lib/repositories/writeReceiptRepository.js";
import { RESULT_PUBLICATION_HEADERS } from "../../lib/repositories/resultPublicationRepository.js";
import { MARKS_HEADERS } from "../../lib/schemas/sheetsSchema.mjs";
import { getStaffPermissions } from "../../lib/authorization.mjs";
import { createWriteCoordinator } from "../../lib/services/writeCoordinationService.mjs";
import { createMarksService } from "../../lib/services/marksService.mjs";
import { createResultPublicationService } from "../../lib/services/resultPublicationService.mjs";
import { buildClassAnalyticsData } from "../../lib/analytics.js";
import {
  marksExpectedState,
  publicationExpectedState,
} from "../../lib/writeState.mjs";

export function memoryWriteAdapter(now) {
  const locks = new Map();
  const pending = new Map();
  const adapter = {
    locks,
    intents: pending,
    initialized: true,
    ready: async () => adapter.initialized,
    acquire: async (key, owner, ttl) => {
      if (locks.has(key) && locks.get(key).expires > now()) return false;
      locks.set(key, { owner, expires: now() + ttl });
      return true;
    },
    renew: async (key, owner, ttl) => {
      const lock = locks.get(key);
      if (!lock || lock.owner !== owner || lock.expires <= now()) return false;
      lock.expires = now() + ttl;
      return true;
    },
    release: async (key, owner) => {
      if (locks.get(key)?.owner === owner) locks.delete(key);
    },
    pending: async (key) => pending.get(key),
    dispatch: async (key, pendingKey, owner, record) => {
      if (
        locks.get(key)?.owner !== owner ||
        locks.get(key).expires <= now() ||
        pending.has(pendingKey)
      )
        return false;
      pending.set(pendingKey, structuredClone(record));
      return true;
    },
    clearPending: async (key, operationId) => {
      if (pending.get(key)?.operationId === operationId) pending.delete(key);
    },
  };
  return adapter;
}

export function writeFixture() {
  let clock = Date.now();
  const now = () => clock;
  const adapter = memoryWriteAdapter(now);
  const staff = {
    Teacher_ID: "T1",
    Email: "teacher@example.test",
    Role: "Admin_Exam",
  };
  const tables = {
    Marks_Log: [MARKS_HEADERS],
    Result_Publications: [RESULT_PUBLICATION_HEADERS],
    Write_Receipts: [WRITE_RECEIPT_HEADERS],
    Audit_Log: [AUDIT_HEADERS],
  };
  const ids = { Marks_Log: 1, Result_Publications: 2, Write_Receipts: 3, Audit_Log: 4 };
  const base = {
    Students: [
      { Kit_No: "100", Grade: "9", Section: "A" },
      { Kit_No: "200", Grade: "9", Section: "B" },
    ],
    exam_scheme: [
      {
        Exam_ID: "E1",
        Grade: "9",
        Subject: "English",
        Max_Marks: "100",
        Academic_Session: "2026-27",
        Exam_Order: "1",
      },
    ],
    Grading_System: [],
    Staff_Directory: [staff],
    Teaching_Assignments: [],
  };
  const f = {
    tables,
    adapter,
    now,
    advance: (ms) => {
      clock += ms;
    },
    batches: [],
    invalidations: 0,
    logs: [],
    readFailure: false,
    mode: "success",
  };
  f.db = () => ({
    ...base,
    ...Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        rows
          .slice(1)
          .map((row) =>
            Object.fromEntries(
              rows[0].map((header, i) => [header, String(row[i] ?? "")]),
            ),
          ),
      ]),
    ),
  });
  f.current = {
    staff,
    permissions: getStaffPermissions(staff, base),
    authorizationDb: base,
  };
  const value = (cell) =>
    cell?.userEnteredValue?.stringValue ??
    cell?.userEnteredValue?.numberValue ??
    "";
  f.storage = {
    spreadsheetId: "synthetic-workbook",
    sheets: {
      spreadsheets: {
        get: async () => ({
          data: {
            sheets: Object.entries(ids).map(([title, sheetId]) => ({
              properties: { title, sheetId },
            })),
          },
        }),
        values: {
          get: async ({ range }) => {
            if (f.readFailure) throw new Error("Synthetic read failed");
            const title = range.replaceAll("'", "");
            return { data: { values: structuredClone(tables[title] || []) } };
          },
        },
        batchUpdate: async (request, options) => {
          f.batches.push({ request, options });
          if (f.beforeBatch) await f.beforeBatch(request);
          if (f.mode === "reject")
            throw Object.assign(new Error("synthetic rejection"), {
              response: { status: 400 },
            });
          if (f.mode === "unknown")
            throw new Error("synthetic timeout before commit");
          // Build a copy and apply all requests atomically.
          const next = structuredClone(tables);
          for (const entry of request.requestBody.requests) {
            const mutation = entry.appendCells || entry.updateCells;
            const title = Object.keys(ids).find(
              (name) =>
                ids[name] === (mutation.sheetId ?? mutation.range.sheetId),
            );
            if (entry.appendCells)
              next[title].push(
                ...mutation.rows.map((row) => row.values.map(value)),
              );
            else
              mutation.rows.forEach((row, i) =>
                row.values.forEach((cell, column) => {
                  next[title][mutation.range.startRowIndex + i][
                    mutation.range.startColumnIndex + column
                  ] = value(cell);
                }),
              );
          }
          Object.assign(tables, next);
          if (f.mode === "lost")
            throw new Error("synthetic timeout after commit");
          return { data: {} };
        },
      },
    },
  };
  f.coordinator = (overrides = {}) =>
    createWriteCoordinator({
      env: {
        WRITE_COORDINATION_SECRET: "synthetic-secret",
        WRITE_COORDINATION_NAMESPACE: "synthetic-tests",
      },
      now,
      adapter,
      getContext: async () => f.storage,
      invalidate: () => {
        f.invalidations++;
      },
      log: (level, event, context, fields) =>
        f.logs.push({ level, event, context, fields }),
      wait: async () => {
        await new Promise((resolve) => setImmediate(resolve));
      },
      ...overrides,
    });
  f.dependencies = (overrides = {}) => ({
    coordinateWrite: f.coordinator(),
    loadFreshDatabaseTabs: async () => {
      if (f.readFailure) throw new Error("Synthetic read failed");
      return f.db();
    },
    loadMasterDatabase: async () => f.db(),
    ...overrides,
  });
  f.marksService = (overrides = {}) =>
    createMarksService(f.dependencies(overrides));
  f.publicationService = (overrides = {}) =>
    createResultPublicationService(f.dependencies(overrides));
  let nextId = 0;
  f.marks = (kitNo = "100", marks = 80) => {
    const body = {
      saveId: `SYNTHETIC-SAVE-${String(++nextId).padStart(5, "0")}`,
      examId: "E1",
      grade: "9",
      section: kitNo === "100" ? "A" : "B",
      subject: "English",
      records: [
        { Kit_No: kitNo, attendance: "present", Marks_Obtained: marks },
      ],
    };
    body.expectedState = marksExpectedState(f.db(), body);
    return body;
  };
  f.publication = (status = "Published") => {
    const body = {
      saveId: `SYNTHETIC-PUBLICATION-${++nextId}`,
      grade: "9",
      section: "A",
      kitNo: "100",
      academicSession: "2026-27",
      examId: "E1",
      status,
      revisionReason: status === "Revised" ? "Synthetic correction" : "",
    };
    const cadet = buildClassAnalyticsData(f.db(), "9", "A", "E1", "2026-27")
      .meritGrid[0];
    body.expectedState = publicationExpectedState(
      cadet,
      f.db().Result_Publications,
    );
    return body;
  };
  return f;
}

import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { getWriteContext } from "../repositories/googleSheetsClient.js";
import {
  loadWriteReceipts,
  commitWriteBatch,
} from "../repositories/writeReceiptRepository.js";
import { invalidateAcademicCache } from "../repositories/academicRepository.js";
import { getWriteAdapter, CoordinationError, coordinationFailureCategory } from "./writeCoordinationAdapter.mjs";
import { normalizedWritePayload, stableJson } from "../writeState.mjs";
import { logApiEvent } from "../requestContext.mjs";
import { ServiceError } from "./serviceError.mjs";
import { auditIdentity, planAudit } from "./auditService.mjs";
import { SheetWriteError } from "../repositories/sheetRows.mjs";

const hash = (value) =>
  createHash("sha256").update(stableJson(value)).digest("hex");
const failure = (code, message, status = 503) =>
  new ServiceError({ status, code, error: message });
export function assertExpectedState(expected, actual) {
  if (stableJson(expected) !== stableJson(actual)) {
    throw failure(
      "WRITE_STATE_CONFLICT",
      "Stored data changed. Refresh and review your marks before saving again.",
      409,
    );
  }
}

export function validateWriteEnvelope(body) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(body?.saveId || "") ||
    typeof body.saveId !== "string" ||
    !body.expectedState ||
    typeof body.expectedState !== "object"
  ) {
    throw failure(
      "WRITE_REQUEST_INVALID",
      "A valid save ID and expected state are required. Refresh and try again.",
      422,
    );
  }
}

export function createWriteCoordinator(dependencies = {}) {
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => Date.now());
  const wait =
    dependencies.wait ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = dependencies.log || logApiEvent;
  const invalidate = dependencies.invalidate || invalidateAcademicCache;
  const load = dependencies.loadReceipts || loadWriteReceipts;
  const leaseMs = dependencies.leaseMs || 30000;
  const maxMs = dependencies.maxMs || 120000;

  return async function coordinate({
    kind,
    current,
    body,
    context = {},
    execute,
  }) {
    context = { ...context, requestId: context.requestId || randomUUID() };
    validateWriteEnvelope(body);
    const diagnostic = (failureCategory, phase) => log(
      "warn", `${kind}.coordination_unavailable`, context, {
        environment: env.NODE_ENV === "production" ? "production" : "development",
        provider: "upstash",
        failureCategory,
        phase,
      },
    );
    let adapter;
    let storage;
    try {
      if (!env.WRITE_COORDINATION_SECRET || !env.WRITE_COORDINATION_NAMESPACE)
        throw new CoordinationError("CONFIG_MISSING");
      const provider = dependencies.adapter || (dependencies.getAdapter || getWriteAdapter)(env);
      // Wrap provider calls without logging raw errors, keys, credentials or payloads.
      adapter = Object.fromEntries(Object.entries(provider).filter(([, call]) => typeof call === "function").map(([name, call]) => [name,
        async (...args) => {
          try { return await call(...args); } catch (error) {
            const category = coordinationFailureCategory(error);
            diagnostic(category, name);
            throw new CoordinationError(category);
          }
        },
      ]));
    } catch (error) {
      diagnostic(coordinationFailureCategory(error), "initialization");
      throw failure("WRITE_COORDINATION_UNAVAILABLE",
        "Write coordination is unavailable. Nothing was saved.");
    }
    try {
      storage = await (dependencies.getContext || getWriteContext)();
    } catch {
      diagnostic("STORAGE_CONTEXT_UNAVAILABLE", "storage");
      throw failure("WRITE_COORDINATION_UNAVAILABLE",
        "Write coordination is unavailable. Nothing was saved.");
    }
    const ref = (value) =>
      createHmac("sha256", env.WRITE_COORDINATION_SECRET)
        .update(String(value))
        .digest("hex");
    const prefix = `pscc:write:v1:${ref(env.WRITE_COORDINATION_NAMESPACE)}:${ref(storage.spreadsheetId)}`;
    const actorRef = ref(
      String(current.staff.Email || "")
        .trim()
        .toLowerCase() +
        "\0" +
        String(current.staff.Teacher_ID || "").trim(),
    );
    const operationId = ref(body.saveId);
    const payloadHash = hash(normalizedWritePayload(kind, body));
    const preconditionHash = hash(body.expectedState);
    const lockKey = `${prefix}:lock`;
    const pendingKey = `${prefix}:pending`;
    const owner = randomUUID();
    let acquired = false;
    let dispatched = false;
    let committed = false;
    let leaseLost = false;
    let renewal;
    let table;
    let auditPlanned = false;
    const started = now();
    const fields = { operationRef: operationId, actorRef, operationType: kind };

    function matchReceipt(table) {
      const matches = table.rows.filter(
        (row) => row.Operation_ID === operationId,
      );
      if (matches.length > 1)
        throw failure(
          "WRITE_RECEIPT_INVALID",
          "Write receipts require administrator review.",
        );
      if (!matches.length) return null;
      const stored = matches[0];
      if (stored.Actor_Ref !== actorRef)
        throw failure(
          "WRITE_OWNER_CONFLICT",
          "This save ID belongs to another authenticated actor.",
          403,
        );
      if (
        stored.Operation_Type !== kind ||
        stored.Payload_Hash !== payloadHash ||
        stored.Precondition_Hash !== preconditionHash
      ) {
        throw failure(
          "WRITE_ID_CONFLICT",
          "This save ID has already been used for a different request.",
          409,
        );
      }
      let receipt;
      try {
        receipt = JSON.parse(stored.Receipt_JSON);
      } catch {
        throw failure(
          "WRITE_RECEIPT_INVALID",
          "Write receipt requires administrator review.",
        );
      }
      if (!receipt.success || receipt.saveId !== body.saveId)
        throw failure(
          "WRITE_RECEIPT_INVALID",
          "Write receipt requires administrator review.",
        );
      return receipt;
    }

    async function replay(receipt) {
      committed = true;
      invalidate();
      // A visible atomic receipt proves the dispatched batch has committed.
      // Cleanup is best effort; failure cannot erase proof of success.
      try {
        await adapter.clearPending(pendingKey, operationId);
      } catch {
        /* Later reconciliation can repeat cleanup. */
      }
      log("info", "write.replayed", context, fields);
      return { ...receipt, status: "ALREADY_PROCESSED", idempotent: true };
    }

    async function recordAttempt(error) {
      if (!acquired || leaseLost || now() - started >= maxMs || !table)
        return false;
      if (error.code === "WRITE_UNKNOWN_OUTCOME") return false;
      // Never dispatch alongside an unresolved academic or attempt operation.
      if (await adapter.pending(pendingKey)) return false;
      const conflict =
        error.status === 409 ||
        error.status === 403 ||
        [
          "PUBLICATION_EVENT_CONFLICT",
          "INVALID_PUBLICATION_TRANSITION",
          "UNCHANGED_PUBLICATION",
        ].includes(error.code);
      const action =
        kind === "marks"
          ? conflict
            ? "MARKS_CONFLICT"
            : "MARKS_FAILED"
          : conflict
            ? "PUBLICATION_CONFLICT"
            : "PUBLICATION_FAILED";
      const audit = await planAudit(
        storage,
        auditIdentity(current, body, context, kind),
        [
          {
            Action_Type: action,
            Resource_Type: "SAVE",
            Resource_Key: JSON.stringify([kind, body.saveId]),
            Outcome: conflict ? "CONFLICT" : "FAILED",
            Reason: /^[A-Z][A-Z0-9_]{0,80}$/.test(error.code || "")
              ? error.code
              : "WRITE_FAILED",
          },
        ],
        now(),
      );
      if (
        leaseLost ||
        now() - started >= maxMs ||
        !(await adapter.renew(
          lockKey,
          owner,
          Math.min(leaseMs, maxMs - (now() - started)),
        ))
      )
        return false;
      const attemptId = ref("audit-attempt:" + randomUUID());
      const attemptHash = hash(audit.events);
      const record = {
        Operation_ID: attemptId,
        Operation_Type: "audit_attempt",
        Actor_Ref: actorRef,
        Payload_Hash: attemptHash,
        Precondition_Hash: "",
        Recorded_At: audit.events[0].Timestamp,
        Receipt_JSON: JSON.stringify({
          success: true,
          auditAttempt: true,
          auditIds: audit.events.map((event) => event.Audit_ID),
        }),
      };
      if (
        !(await adapter.dispatch(lockKey, pendingKey, owner, {
          operationId: attemptId,
          actorRef,
          payloadHash: attemptHash,
          kind: "audit_attempt",
        }))
      )
        throw new Error("Attempt audit dispatch unavailable.");
      try {
        await commitWriteBatch(storage, [audit.request], table, record);
      } catch (appendError) {
        // Receipt proves the attempt batch committed after a lost response.
        const receipts = await load(storage);
        if (
          !receipts.rows.some(
            (row) =>
              row.Operation_ID === attemptId &&
              row.Actor_Ref === actorRef &&
              row.Payload_Hash === attemptHash &&
              row.Operation_Type === "audit_attempt",
          )
        ) {
          if (
            [400, 401, 403, 404, 413, 422, 429].includes(
              Number(appendError?.response?.status),
            )
          )
            await adapter.clearPending(pendingKey, attemptId);
          throw appendError;
        }
      }
      // Cleanup failure cannot erase durable proof of the attempt append.
      try {
        await adapter.clearPending(pendingKey, attemptId);
      } catch {
        /* Reconcile from its receipt next time. */
      }
      return true;
    }

    try {
      if (!(await adapter.ready(prefix))) {
        diagnostic("READINESS_MISSING", "ready");
        throw failure(
          "WRITE_COORDINATION_UNAVAILABLE",
          "Write coordination has not been initialized.",
        );
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        acquired = await adapter.acquire(lockKey, owner, leaseMs);
        if (acquired) break;
        if (attempt < 3) await wait(100 + Math.floor(Math.random() * 100));
      }
      if (!acquired) {
        diagnostic("LOCK_ACQUISITION_FAILED", "acquire");
        log("warn", "write.lock_timeout", context, fields);
        throw failure(
          "WRITE_BUSY",
          "Another save is in progress. Retry this same request shortly.",
        );
      }
      renewal = setInterval(
        async () => {
          try {
            const remaining = maxMs - (now() - started);
            if (
              remaining <= 0 ||
              !(await adapter.renew(
                lockKey,
                owner,
                Math.min(leaseMs, remaining),
              ))
            )
              leaseLost = true;
          } catch {
            leaseLost = true;
          }
        },
        Math.max(10, Math.floor(leaseMs / 3)),
      );
      renewal.unref?.();
      table = await load(storage);
      const receipt = matchReceipt(table);
      if (receipt) return await replay(receipt);
      const pending = await adapter.pending(pendingKey);
      if (pending) {
        if (
          pending.operationId === operationId &&
          pending.actorRef !== actorRef
        ) {
          throw failure(
            "WRITE_OWNER_CONFLICT",
            "This save ID belongs to another authenticated actor.",
            403,
          );
        }
        if (
          pending.operationId === operationId &&
          (pending.payloadHash !== payloadHash || pending.kind !== kind)
        ) {
          throw failure(
            "WRITE_ID_CONFLICT",
            "This save ID is already associated with a different request.",
            409,
          );
        }
        // Reconcile any prior dispatch before allowing a new logical write.
        const prior = table.rows.find(
          (row) => row.Operation_ID === pending.operationId,
        );
        if (
          prior &&
          prior.Actor_Ref === pending.actorRef &&
          prior.Payload_Hash === pending.payloadHash &&
          prior.Operation_Type === pending.kind
        ) {
          await adapter.clearPending(pendingKey, pending.operationId);
        } else {
          throw failure(
            "WRITE_UNKNOWN_OUTCOME",
            "A previous save has an unresolved outcome. Do not create a new save; retry the original request or contact the examination administrator.",
          );
        }
      }
      log("info", "write.started", context, fields);
      const operation = {
        storage,
        async commit(requests, payload, changes) {
          if (leaseLost || now() - started >= maxMs)
            throw failure(
              "WRITE_BUSY",
              "Save lease expired before writing. Retry the same request.",
            );
          if (
            !(await adapter.renew(
              lockKey,
              owner,
              Math.min(leaseMs, maxMs - (now() - started)),
            ))
          ) {
            leaseLost = true;
            throw failure(
              "WRITE_BUSY",
              "Save lease changed before audit planning. Retry the same request.",
            );
          }
          const audit = await planAudit(
            storage,
            auditIdentity(current, body, context, kind),
            changes || [],
            now(),
          );
          auditPlanned = true;
          if (dispatched || committed)
            throw new Error("Only one atomic write is allowed per operation.");
          if (leaseLost || now() - started >= maxMs)
            throw failure(
              "WRITE_BUSY",
              "Save lease expired before writing. Retry the same request.",
            );
          const receipt = {
            ...payload,
            auditIds: audit.events.map((event) => event.Audit_ID),
            auditVersion: 1,
            saveId: body.saveId,
            status: payload.idempotent ? "ALREADY_PROCESSED" : "SAVED",
            savedCount: payload.count ?? (payload.inserted === false ? 0 : 1),
          };
          const record = {
            Operation_ID: operationId,
            Operation_Type: kind,
            Actor_Ref: actorRef,
            Payload_Hash: payloadHash,
            Precondition_Hash: preconditionHash,
            Recorded_At: new Date(now()).toISOString(),
            Receipt_JSON: JSON.stringify(receipt),
          };
          // This call can itself have a lost response. In that case the durable
          // intent may exist, but this process MUST NOT send a Sheets mutation.
          if (
            !(await adapter.dispatch(lockKey, pendingKey, owner, {
              operationId,
              actorRef,
              payloadHash,
              kind,
            }))
          ) {
            throw failure(
              "WRITE_BUSY",
              "Save lease changed before writing. Retry the same request.",
            );
          }
          dispatched = true;
          try {
            await commitWriteBatch(
              storage,
              [...requests, audit.request],
              table,
              record,
            );
          } catch (error) {
            // Reads can prove commit, but absence cannot prove remote failure.
            try {
              table = await load(storage);
              const completed = matchReceipt(table);
              if (completed) return await replay(completed);
            } catch {
              /* Preserve UNKNOWN_OUTCOME when reconciliation cannot establish success. */
            }
            const status = Number(error?.response?.status);
            if ([400, 401, 403, 404, 413, 422, 429].includes(status)) {
              await adapter.clearPending(pendingKey, operationId);
              throw failure(
                "WRITE_REJECTED",
                "The upstream service rejected the save. Nothing was saved.",
              );
            }
            invalidate();
            throw failure(
              "WRITE_UNKNOWN_OUTCOME",
              "The save outcome is uncertain. Retry this same request to check its receipt; do not start a new save.",
            );
          }
          committed = true;
          invalidate();
          try {
            await adapter.clearPending(pendingKey, operationId);
          } catch {
            /* Atomic receipt remains authoritative. */
          }
          log("info", "write.completed", context, {
            ...fields,
            savedCount: receipt.savedCount,
          });
          return receipt;
        },
      };
      const result = await execute(operation);
      if (!committed)
        throw new Error(
          "A protected workflow returned without committing its receipt.",
        );
      return result;
    } catch (error) {
      // Audit storage/planning failures are reported explicitly, without attempting
      // to claim another event was saved into the same unavailable audit store.
      if (String(error.code || "").startsWith("AUDIT_")) {
        log("error", "audit.persistence_failed", context, {
          ...fields,
          code: error.code,
          dispatched,
        });
        throw error;
      }
      if (!(error instanceof CoordinationError) && !committed && (!dispatched || error.code === "WRITE_REJECTED")) {
        try {
          const recorded = await recordAttempt(error);
          log(
            recorded ? "info" : "warn",
            recorded ? "audit.attempt_recorded" : "audit.attempt_not_recorded",
            context,
            { ...fields, code: error.code || "WRITE_FAILED" },
          );
        } catch {
          log("error", "audit.persistence_failed", context, {
            ...fields,
            originalCode: error.code || "WRITE_FAILED",
            dispatched,
            auditPlanned,
          });
          throw new ServiceError({
            status: 503,
            code: "AUDIT_PERSISTENCE_FAILED",
            error:
              "The examination operation failed or conflicted, and its attempt audit could not be confirmed.",
            details: [{ code: error.code || "WRITE_FAILED" }],
          });
        }
      }
      const event =
        error.status === 409 || error.status === 403
          ? kind === "publication"
            ? "publication.conflict"
            : "write.conflict"
          : "write.failed";
      log("warn", event, context, {
        ...fields,
        code: error.code || "WRITE_FAILED",
        dispatched,
      });
      if (error instanceof ServiceError) throw error;
      if (
        error instanceof SheetWriteError &&
        [
          "PUBLICATION_EVENT_CONFLICT",
          "INVALID_PUBLICATION_TRANSITION",
          "UNCHANGED_PUBLICATION",
        ].includes(error.code)
      ) {
        throw failure(
          error.code,
          "The publication conflicts with newer stored state. Refresh and review before retrying.",
          409,
        );
      }
      // Do not infer success or retry after a Redis response is lost.
      throw failure(
        dispatched ? "WRITE_UNKNOWN_OUTCOME" : "WRITE_COORDINATION_UNAVAILABLE",
        dispatched
          ? "The save outcome is uncertain. Retry the same request to check its receipt."
          : "Write coordination or prerequisite storage is unavailable. No Sheets mutation was dispatched.",
      );
    } finally {
      clearInterval(renewal);
      if (acquired)
        try {
          await adapter.release(lockKey, owner);
        } catch {
          /* Lease expires automatically. */
        }
    }
  };
}

export const coordinateWrite = createWriteCoordinator();

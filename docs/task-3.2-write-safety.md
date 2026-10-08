# Task 3.2: write coordination and retry protection

## Approved design and storage contract

Google Sheets remains the examination store. Routes still enforce origin, rate limits, fresh staff approval, body limits and request IDs. Services enforce scope/validation, coordinate writes and check expected state; repositories plan one atomic Sheets mutation. Ranking, grading and marks validation are unchanged.

`Submission_ID` remains the persistent marks-row identity. It is not a logical request ID and does not establish original actor ownership. Existing target ownership and teaching permissions still apply. Every logical save now supplies a distinct validated `saveId` (16?128 ASCII letters/digits/underscore/hyphen, starting with a letter/digit) and `expectedState`. A deliberate edit uses a new save ID. The ID is bound server-side to authenticated email and Teacher_ID, operation type, normalized request hash and precondition hash; clients never supply the authoritative actor.

Receipts permanently record save-ID use. Same ID, same actor and same normalized intent returns ALREADY_PROCESSED without touching examination rows. Changed intent returns 409 WRITE_ID_CONFLICT; another actor returns 403 WRITE_OWNER_CONFLICT. Revoked current access cannot replay a receipt. Fresh validation is retained before marks replays; if prerequisite data is now invalid, replay is denied rather than weakening validation.

## Required setup (not performed by this local-only task)

Writes deliberately fail closed until both receipt storage and shared coordination are provisioned. There is no memory fallback, including development. Existing Upstash rate-limit failure policy remains unchanged.

1. Back up the explicitly selected workbook. Add a tab named `Write_Receipts`, with exactly these required headers (reordering and extra named columns are supported):

   ```text
   Operation_ID | Operation_Type | Actor_Ref | Payload_Hash | Precondition_Hash | Recorded_At | Receipt_JSON
   ```

   Header-only is valid. Protect the entire tab against routine administrator edits, sorting and deletion. Grant the application service account write access. The application never creates tabs automatically and never exposes this tab through `/api/database`.

2. Set existing Upstash credentials plus `WRITE_COORDINATION_SECRET` and `WRITE_COORDINATION_NAMESPACE`. Use a new stable secret independent of authentication/rate-limit secrets, a unique namespace per environment/workbook deployment, and the same settings on every instance writing the same workbook. Never point multiple independent namespaces at one workbook. Changing the secret or namespace breaks continuity and is not a safe routine rotation.
3. Require durable Redis persistence and **no eviction** of coordination state. Monitor availability and capacity. A TTL lock alone is insufficient; pending intent must survive crashes and lease expiry. The application cannot detect arbitrary partial loss of Redis keys while a readiness key survives. Redis rollback/restore/loss requires stopping all writers and reconciling outstanding operations before reinitialization.
4. With the chosen environment loaded, run this offline helper to obtain hashed keys:

   ```powershell
   node --env-file=.env.local scripts/write-coordination-keys.mjs
   ```

   It requires explicit GOOGLE_SHEET_ID, prints no credential/identity values, and contacts neither Redis nor Sheets.
5. Only after setup verification and with no unresolved/active operations, use the Upstash console to store the printed `ready` key as the string `ready-v1`, without expiry. Do not add readiness automatically on application startup. This session does not initialize any connected Redis database.

No workbook migration or existing-row change is required. Receipt schema validation occurs at the write boundary, independently of the Task 3.1 nine-tab examination scanner.

## Coordination protocol

Keys use HMAC-SHA256 references for namespace/workbook/actor/operation; keys expose no student, exam or teacher identifiers:

```text
pscc:write:v1:{namespaceHmac}:{workbookHmac}:ready
pscc:write:v1:{namespaceHmac}:{workbookHmac}:lock
pscc:write:v1:{namespaceHmac}:{workbookHmac}:pending
```

The initial implementation uses a shared workbook mutation lock, covering both marks and publication. Different scopes serialize, but unrelated expected-state comparisons remain independent. Acquisition has four attempts with short bounded jitter. The lease is 30 seconds; owner-checked Lua renews it and ownership is limited to 120 seconds. Release cannot delete another instance's lock. Redis requests have a five-second timeout and SDK retries are disabled.

After acquiring, the coordinator reads the full header-mapped receipt table. It either replays the original receipt or reconciles an existing pending intent. No new write can proceed past an unresolved dispatched operation. Atomic Lua verifies current lock ownership and registers durable pending intent immediately before the single Sheets mutation. It is sent once, with automatic mutation retry explicitly disabled. The batch combines owned marks updates/appends, or a publication event append, with one receipt append. No-op publication equivalence creates only a receipt, not an unnecessary examination event.

A committed receipt proves that all changes in that batch were applied. Redis completion/release failures cannot turn confirmed success into failure. A subsequent instance can use the atomic receipt to clear a matching pending guard. A missing receipt does **not** prove failure: the upstream request might still be running. Lock expiry never authorizes redispatch or removal of the pending guard. This deliberate safety stop is not an expiring lock deadlock; it is an unresolved transaction requiring evidence.

## Conflict checks

Marks compare the editor's original targeted rows (normalized key, persistent Submission_ID, canonical marks, and existence). Duplicate matches remain visible rather than collapsing. Both the service's fresh prerequisite snapshot and repository's fresh planning read are compared. This prevents sequential stale writes, overlapping teacher saves and old-save replay overwrites.

Publication compares calculation content, legacy calculation fingerprint and ordered result history. SHA-256 precondition hashing does not depend only on the legacy FNV hash. Repository history is rechecked before planning. Revisions must reference the latest official event, and historical matches do not substitute for the latest state. Existing Draft, Published and Revised semantics, result calculation fingerprint and Recorded_By are retained.

Browser handlers guard immediate repeated invocations and persist actor/scope-specific pending request envelopes. Uncertain/network failures retain the original save ID and precondition, including across reloads. If input values change while an operation is unresolved, the handler blocks dispatch; restoring the original values allows receipt reconciliation. A refreshed baseline or newly returned row ID never replaces the pending request's original envelope. Storage failure blocks request creation. Marks drafts persist a separate original baseline; legacy drafts without it require cancel/refresh/review before saving. Conflicts retain the draft for review; cancel clears its old baseline.

## Outcome and retry policy

| Condition | Public outcome | Mutation/retry behavior |
| --- | --- | --- |
| Successful batch | SAVED | Return durable receipt; invalidate local academic cache |
| Existing matching receipt | ALREADY_PROCESSED | No examination mutation; invalidate cache |
| Changed payload/expected state | CONFLICT | 409; no mutation; refresh and review |
| Another actor's save ID | CONFLICT | 403; no other actor receipt disclosed |
| Failed prerequisite/schema/read | FAILED | No mutation; retain safe generic error |
| Invalid marks/publication | Existing validation response | No mutation |
| Missing/unavailable Redis or readiness | FAILED | 503; fail closed |
| Busy/expired lease before dispatch | FAILED / WRITE_BUSY | 503; Retry-After; resend the same envelope |
| Definite upstream batch rejection | FAILED / WRITE_REJECTED | 503; clear matching intent; no examination effects |
| Timeout/network/5xx after dispatch | UNKNOWN_OUTCOME | 503; retain guard; read receipt, never blind redispatch |
| Lost successful HTTP response | ALREADY_PROCESSED on retry | Return original receipt with current request ID |

Pure Sheets reads use bounded client retries (two retries, one no-response retry, 20-second total retry budget, 10-second per-request timeout). Writes override retry=false. A client timeout does not cancel a remote Sheets operation. Retry the protected endpoint only with the exact original logical request; after unknown dispatch it is a receipt check, not another mutation. Validation, conflict and ownership errors are not automatic retries.

Success retains existing response fields plus saveId, status, savedCount and current requestId. Receipt counts are preserved on replay. No internal row numbers are returned. Structured logs include write.started/completed/replayed/conflict/lock_timeout/failed and publication.conflict with hashed references, counts and safe codes; no marks or raw staff identities.

## Cache behavior

Confirmed commits and replays invalidate the local master cache. Uncertain write outcomes also invalidate it conservatively. Protected database reads now fetch Result_Publications fresh alongside Students and Marks_Log, so another instance's cached history cannot immediately restore old publication state. The browser discards earlier database response generations, including old preview contexts. Full distributed cache redesign remains outside Task 3.2.

## Unknown-outcome recovery

Retry the original envelope to look for its atomic receipt. If visible, the coordinator returns ALREADY_PROCESSED and can clear the matching guard. If absent, it returns UNKNOWN_OUTCOME without a second mutation, even after lease expiry.

For an indefinitely unresolved intent, the examination administrator must stop all application writers, ensure original invocations and upstream requests can no longer run, back up and inspect the selected workbook's receipt/history and relevant rows, and establish whether commit occurred. Do not infer failure from an immediate absent receipt or delete the guard while an old invocation can still dispatch. Only after that evidence and review may the corresponding pending intent be resolved externally. This task does not add an automated destructive recovery tool. If non-commit cannot be established, keep writes blocked.

Redis state loss, restoration, namespace/secret changes, or receipt deletion cannot be repaired by simply adding the ready sentinel. Pause writers and reconcile before restoring service. Do not roll back to uncoordinated writers while any batch or pending guard exists. Retain receipts across application rollbacks, and never delete them as a routine cleanup.

## Manual Sheets edits and limits

Manual edits do not acquire Redis locks. Fresh checks detect edits before planning checks, including changed marks and publication history. Manual sorts, row insertion/deletion or value changes between the final read and Sheets commit cannot be fenced by this API. Avoid concurrent manual edits, or stop application writers for an administrator maintenance window. Receipt edits/deletion also destroy recovery evidence and are unsupported.

Read/compare/write is not an externally enforced Sheets compare-and-swap transaction. Protection against app writers depends on all instances using this coordinator and a shared durable Redis namespace; protection against arbitrary external writers is limited. Unknown outcomes may reduce availability until resolved. The receipt scan grows with operation history. These limits are explicit; this implementation does not claim an unconditional exactly-once distributed transaction.

## Local verification

Synthetic tests exercise service instances sharing mocked Sheets/Redis, leases, late batches, ownership, conflicts, response loss, publication history and cache invalidation. No staging/production workbook or connected Redis is used. See task-3.2-completion.md for final check results and changed files.

## Task 3.4 audit integration

Fresh writes add mandatory Audit_Log appends to the same atomic academic-write/receipt batch. Receipts retain original audit UUIDs; existing replays never duplicate mutation history. Confirmed conflicts/failures can use independent coordinated audit-only receipts. Unknown guards, lease ownership, actor/intent binding, expected state and disabled mutation retries remain authoritative. See [audit-history.md](audit-history.md). Pre-3.4 receipts remain replayable without fabricated audits.

## Local and production write readiness

Localhost uses the same real Upstash coordinator as production. There is no memory fallback for examination writes. Required settings are UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, WRITE_COORDINATION_SECRET and WRITE_COORDINATION_NAMESPACE, alongside Google Sheets service-account credentials. RATE_LIMIT_HASH_SECRET is separately required for production rate limiting; it does not replace the write secret. Audit cursor encryption uses the write secret; no additional audit environment variable is required.

Keep the write secret strong (at least 32 characters), stable and private. Every application instance writing the SAME workbook must use the SAME secret and namespace. Changing either changes lock keys and receipt identity; do not change them while any other writers or unresolved operations remain active. A local development namespace such as pscc-exam-dev is appropriate only for a distinct confirmed staging workbook. Different staging and production workbooks must use isolated namespaces, even when sharing an authorized Redis instance. Never point an isolated development coordinator at a production workbook that uses different coordination identity.

Use an explicit GOOGLE_SHEET_ID for writable staging/test environments; it is strongly recommended for all writable deployments. Do not test writes through title-based discovery or against an unknown workbook. Successful read APIs do not prove write coordination is ready. Connectivity alone also does not prove readiness: the workbook-specific ready-v1 sentinel, Write_Receipts, required operational sheets and Audit_Log schema must be verified separately. Do not create tabs or initialize Redis coordination over unresolved operations without the applicable approvals. The current localhost fix does not modify production configuration or any workbook.

Public failures remain safe WRITE_COORDINATION_UNAVAILABLE responses. Structured marks.coordination_unavailable or publication.coordination_unavailable events contain request ID, environment, provider, failureCategory and phase, never raw exceptions or credentials. Categories are CONFIG_MISSING, CONFIG_INVALID, PROVIDER_INITIALIZATION_FAILED, PROVIDER_UNAVAILABLE, NETWORK_FAILURE, READINESS_MISSING, LOCK_ACQUISITION_FAILED and STORAGE_CONTEXT_UNAVAILABLE. Lock contention retains WRITE_BUSY. Existing AUDIT_* errors remain distinct; Redis failures do not claim that an attempt audit was persisted. Configuration validation rejects non-HTTPS URLs, URL credentials/query/fragment, invalid namespace characters and short secrets. It cannot verify secret entropy or credential validity offline.

After configuration changes, restart the local Next.js server. Verify an authorized Redis connection with a read-only PING before any staging mutation. Confirm the target workbook is staging and verify receipt/audit readiness before one controlled synthetic save, persistence, receipt, audit event and identical retry. Academic changes, receipt and mandatory audit append remain in the same atomic Sheets batch; no audit bypass is available on localhost.

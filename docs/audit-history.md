# Examination audit history (Task 3.4)

## Purpose and existing authority

Audit_Log is durable accountability history for newly coordinated examination writes. Operational JSON logs remain separate troubleshooting records.

Marks_Log holds current marks and overwrites existing rows. Result_Publications remains the authoritative append-only source for explicit Draft, Published and Revised history. Write_Receipts remains authoritative for logical-save idempotency and unknown-outcome reconciliation. Audit_Log links these mechanisms without changing calculations, grading, ranking, validation, fingerprints or teaching authorization.

Historical overwritten marks cannot be reconstructed. Existing publications and pre-3.4 receipts remain valid; no fabricated historical changes or actors are backfilled.

## Provisioning (separately authorized; not performed locally)

Back up the selected workbook and stop writers for maintenance. Create exactly Audit_Log in the same workbook as examination records and Write_Receipts. Required headers, with reordering and extra named columns supported:

    Audit_ID | Timestamp | Request_ID | Save_ID | Submission_ID | Actor_ID | Actor_Role | Action_Type | Resource_Type | Resource_Key | Exam_ID | Grade | Section | Subject | Kit_No | Before_Value | After_Value | Outcome | Reason | Source | Metadata_Version

Header-only is valid. Fresh writes fail closed if audit storage is missing, malformed or invalid. Ordinary academic reads do not require or expose it. The application never creates tabs automatically. Protect history against routine editing, sorting, insertion and deletion; restrict direct workbook access to authorized custodians. Sheets OAuth has no separate append-only scope, so application guarantees must be complemented by institutional access controls.

Retain audits and receipts across application rollbacks. Returning to an unaudited writer after activation requires separate review.

## Schema, IDs and privacy

Audit_ID is an immutable server UUID v4, never a row number. Timestamp is UTC ISO text. Under the shared coordinator each batch uses a timestamp strictly later than the preceding audit batch (at least one millisecond); events within it are appended in ascending UUID order. Reverse reads give Timestamp DESC, Audit_ID DESC. Timestamp is application recording time, not exact remote commit time. Bursts or clock skew can place it slightly ahead of wall time.

Actor_ID is the freshly approved staff Teacher_ID; Actor_Role is the exact normalized canonical role. The verified server session and Staff_Directory approval supply identity. Missing authoritative identity blocks planning; client actor fields are ignored. No email column is needed.

Request_ID identifies one HTTP attempt. Mutation and audit-read requests receive server UUIDs irrespective of supplied X-Request-ID. Existing response requestId and X-Request-ID remain. Save_ID copies the existing validated actor/intent-bound saveId context and introduces no competing idempotency mechanism. Submission_ID retains its persisted marks-row meaning. Audit_ID identifies one event.

Resource_Type is MARK, RESULT or SAVE. A mark key is a JSON array of normalized Kit_No, Exam_ID and Subject; a result key is the existing canonical Result_Key. SAVE records an operation without claiming an academic mutation.

Before_Value and After_Value are canonical JSON. Marks contain only finite nonnegative numbers, "ABSENT" or null: 45 to 48; 45 to "ABSENT"; null to 47. Equal normalized marks produce no UPDATE. A wholly unchanged save gets MARKS_SAVED_UNCHANGED at operation level with null values.

Publication snapshots include only Publication_Event_ID, Result_Status, Calculation_Fingerprint, Prior_Event_ID, Policy_Version, Academic_Session and Result_Scope. Previous state comes from explicit stored history, never inferred from marks or dates. Revised events retain the existing validated revision reason.

Outcome is SUCCESS, REPLAYED, CONFLICT or FAILED. Reason is the revision reason or a safe error code, never an upstream exception or request body. Source identifies the server workflow; Metadata_Version is 1. Inapplicable fields are blank.

No names, profiles, passwords, OAuth tokens, cookies, service keys or raw bodies are copied. Appends use literal stringValue cells, preventing formula interpretation. Revision reasons are restricted examination text; staff must not enter unrelated personal information or credentials.

## Stable actions and idempotency

Mutation history: MARKS_CREATED, MARKS_UPDATED, RESULT_DRAFT_RECORDED, RESULT_PUBLISHED, RESULT_REVISED.

Operation/attempt history: MARKS_SAVED_UNCHANGED, MARKS_REPLAYED, MARKS_CONFLICT, MARKS_FAILED, PUBLICATION_REPLAYED, PUBLICATION_CONFLICT, PUBLICATION_FAILED.

MARKS_REPLAYED is reserved. Matching receipt replay performs no new Sheets write: return original auditIds when present and log write.replayed with the current Request_ID. There is no duplicate mutation event. Pre-3.4 receipts have no auditIds; do not invent them. Publication equivalence under a fresh save records PUBLICATION_REPLAYED and a new receipt, with null before/after values.

Conflicts and confirmed failures reached inside coordination can get independent audit-only batches. These use separate server-derived operation identities/receipts and never reserve or consume the original academic Save_ID. Attempt events have null before/after values. No configuration audit workflow is added.

## Atomicity and failure semantics

API routes authenticate; services authorize and validate; repositories read current records and plan owned academic cells plus minimal audit changes. The coordinator validates audit schema, actor, event plans and unique IDs before dispatch. It verifies the lease and registers durable Redis pending intent, then sends one spreadsheets.batchUpdate containing:
1. marks updateCells/appendCells or Result_Publications appendCells;
2. Audit_Log appendCells;
3. Write_Receipts appendCells with original auditIds and auditVersion.

All requests use the same workbook. Google validates/applies the batch atomically across tabs ([official batchUpdate contract](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)). Audit or academic rejection rejects the complete batch; there is no academic commit followed by a separate mandatory audit append. Automatic mutation retries remain disabled.

- Audit storage/schema, duplicate ID/mutation, identity/order or planning failure: explicit AUDIT_* 503 before academic dispatch; audit.persistence_failed operational log.
- Definitive upstream rejection: no academic batch effects. A separate confirmed-failure attempt can be appended under the lock with its own receipt.
- Attempt append rejected or unconfirmed: AUDIT_PERSISTENCE_FAILED 503 with a safe original failure code. Never claim it exists. An uncertain attempt dispatch keeps its own pending guard; future requests reconcile its receipt before new academic writes.
- Timeout/network/5xx after academic dispatch: preserve WRITE_UNKNOWN_OUTCOME and pending guard. Receipt visibility proves academic mutation and audit append committed together. Absence does not prove failure. Never blindly redispatch or invent definitive failure history.
- Lost successful response: replay original receipt/audit IDs without another mutation.
- Successful batch followed by Redis cleanup failure: its receipt remains proof; later reconciliation can clear the matching guard.
- Authentication/origin/rate-limit/body/envelope/service-preflight rejection, unavailable coordination, lost lease or unresolved pending operations can prevent attempt auditing. No academic write occurs. Safe errors/operational logs remain; no durable Audit_Log row is claimed.
- Audit_Log itself unavailable: fail mandatory fresh writes closed and log/report audit persistence failure; do not pretend a failure event was recorded there.

All app writers must share the existing durable non-evicting Redis namespace. Manual Sheets writers bypass it; batch atomicity is not compare-and-swap against external edits. Stop writers for manual maintenance. Outages/process crashes can prevent recording unsuccessful attempts; fresh successful academic mutations require atomic audit durability.

## Append-only and integrity

Normal application code never edits, deletes, sorts, overwrites or reuses prior audit events. Administrative corrections require a separately approved compensating event; no correction endpoint/destructive tool exists in this task.

Planning checks existing UUIDs, mandatory fields, action/outcome/resource/value shapes, append order and duplicate mutation identity (Save_ID + Resource_Type + Resource_Key). Collisions fail before dispatch. Full write-boundary audit/receipt scans grow with history.

Task 3.1's explicit read-only scanner includes Audit_Log and detects malformed schema/events, duplicate IDs/mutations and bad order. It never repairs/deletes history; reports omit mark values, raw rows and actor identities. Missing Audit_Log is an error in a complete scan.

## Restricted audit API

GET /api/audit-history uses fresh staff approval and exact canonical role allowlist: principal, vice principal, admin exam, in charge examination. There is no separate canonical Admin role in this repository. No substring matching or invented role is accepted. Teachers, class teachers and section heads are denied; previewTeacherId is unsupported. Audit_Log is excluded from /api/database, master cache and ordinary scoped APIs.

Validated filters: from/to UTC ISO date-time; actionType; actorId; examId; grade; section; subject; kitNo; requestId; saveId; submissionId. Reject unknown, duplicate, empty, control-character or oversized filters and invalid ranges/actions/limits. Default limit 50; maximum 200.

Response: success, items, nextCursor, hasMore, requestId. Use private/no-store and existing read rate limiting. Cursors use authenticated encryption with a separate derivation of WRITE_COORDINATION_SECRET, binding reader/role, workbook/sheet and filters. Internal row positions are encrypted cursor mechanics, not exposed audit identities.

Read headers plus only the UUID column to establish a populated high-water row; never download all audit payloads per read. Reverse windows contain at most 500 rows, and each request scans at most 5,000 positions. Sparse filters can yield empty items with a continuation cursor. New appends beyond the snapshot high-water row are excluded. A UUID anchor detects obvious truncation/replacement; arbitrary manual interior edits cannot be fully detected without a full snapshot/hash scan.

## Backup, restore and retention

Recommend daily protected backups of the complete operational workbook, including Audit_Log, Result_Publications and Write_Receipts, plus backups before maintenance/corrections/major publication. During active entry, agree more frequent snapshots. Keep restricted timestamped native copies and exports in institution-approved storage. A custody manifest records source workbook, backup time, schema version, nonblank row counts per tab and canonical export checksums. Preserve access controls; never commit real academic backups here.

Restore into a separate protected workbook first. Verify headers, nonblank row counts and checksums; run read-only integrity validation; check audit UUID uniqueness/order, duplicate mutations, publication prior-event links and receipt auditIds against restored events. Compare current marks against latest relevant audit changes where history is complete; preserve pre-3.4 gaps.

Before production cutover, stop writers, back up newer production state, ensure old invocations cannot dispatch, and reconcile pending Redis intents/receipts. Compare newer receipt/audit IDs against the restore candidate; never overwrite newer data with an old backup. Workbook/namespace/secret changes or Redis restore require Task 3.2 reconciliation and separate approval. Resume only after verification. No automated destructive restore command is supplied.

Retention starts indefinite: application code never automatically deletes history. A Sheet has finite cell capacity and performance. Agree an operational threshold based on row/cell counts, scan latency and quota use. Future archival may move old history to protected historical workbooks/storage while retaining Audit_IDs, original values, checksums, manifests and chain of custody plus an approved retrieval/index plan. Actual archival is outside Task 3.4; never silently delete records.

## Local verification

Use mocked/synthetic Sheets and Redis only. Tests cover changes, normalization, actor provenance, replay/conflict, publication/revisions, IDs, authorization/filtering/pagination, rejection/planning/append failures and response loss. Run existing regressions and npm run build. Production provisioning, commit, deployment and push remain separately gated.

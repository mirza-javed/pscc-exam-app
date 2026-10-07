# Phase 3 ? Task 3.2 completion

Implemented the approved local-only concurrency/idempotency design. The user subsequently authorized a local Task 3.2 commit. No push, merge, deployment, live workbook access, connected Redis access, or Task 3.3 work was performed. Required infrastructure setup is documented but has not been applied to any workbook or Redis instance.

## Files created

- `lib/writeState.mjs`: deterministic, client-safe expected-state snapshots and normalized intent serialization.
- `lib/client/saveRequest.mjs`: persisted logical save IDs and safe uncertain-request retry handling.
- `lib/repositories/writeReceiptRepository.js`: header-mapped receipt reads and atomic examination-change/receipt batches.
- `lib/services/writeCoordinationAdapter.mjs`: Upstash acquisition, expiry, owner-checked renewal/release and durable dispatch intent.
- `lib/services/writeCoordinationService.mjs`: actor/payload binding, replay, conflict detection, coordination and outcome recovery.
- `scripts/write-coordination-keys.mjs`: offline hashed-key helper; never contacts Redis or Sheets.
- `tests/helpers/writeFixture.mjs`: shared synthetic Sheets/Redis with atomic batch application and injected failures.
- `tests/write-concurrency.test.mjs`: concurrent writers, retries, leases, unknown outcomes, publication and cache-invalidation coverage.
- `tests/save-retry-client.test.mjs`: browser request persistence, draft baselines and immediate repeated save handling.
- `docs/task-3.2-write-safety.md`: setup, protocol, outcome policy, administrator recovery and limitations.
- `docs/task-3.2-completion.md`: this report.

## Files modified

- `.env.example`: required independent write-coordination secret/namespace and setup reference.
- `app/api/marks/route.js`, `app/api/result-publications/route.js`: request context propagation, receipts, safe write errors, no-store and retry headers.
- `components/Reports/CadetResultCards.jsx`: pass publication history and current actor reference to the existing hook.
- `hooks/useAcademicDatabase.js`: reject older database response generations and old/unmounted contexts.
- `hooks/useMarksDraft.js`, `hooks/useMarksEntry.js`: original-state draft baselines, per-actor pending requests and repeated invocation guard.
- `hooks/useResultPublication.js`: original-state/save-ID retention, replay feedback and repeated invocation guard.
- `lib/apiErrors.mjs`: explicit FAILED/CONFLICT/UNKNOWN_OUTCOME states for write-coordination errors.
- `lib/contracts.mjs`: logical save envelope/receipt documentation.
- `lib/repositories/googleSheetsClient.js`: bounded read retry/timeouts.
- `lib/repositories/marksRepository.js`: fresh expected-state check, coordinated atomic batch, reject uncoordinated default writes.
- `lib/repositories/resultPublicationRepository.js`: fresh history check, latest official prior-event enforcement, coordinated atomic event/receipt batch.
- `lib/requestContext.mjs`: redact WRITE_COORDINATION_SECRET in diagnostic errors.
- `lib/services/academicDataService.mjs`: read publication history fresh with protected records.
- `lib/services/marksService.mjs`, `lib/services/resultPublicationService.mjs`: coordinate saves, retain authorization/validation and return protected receipts.
- `tests/api-errors.test.mjs`: new secret-redaction coverage.
- `tests/repository-reads.test.mjs`: explicit injected synthetic write context for the existing cache characterization.
- `tests/route-handlers.test.mjs`, `tests/services.test.mjs`: explicit coordinator injection for existing characterization; current request IDs/fresh publication reads.
- `tests/ui-characterization.test.mjs`: synthetic draft baseline for the existing save recovery workflow.
- `tests/ui-state.test.mjs`: updated expectation that older database responses cannot replace newer results.

Existing untracked PDF/output artifacts were not deleted or staged. Task-specific verification logs, synthetic browser harness and screenshots are additional untracked artifacts under `output/`.

## Idempotency and ownership

Persistent row `Submission_ID` behavior is preserved, including target association, known-ID requirements, ambiguous-ID rejection and teaching authorization. It has no retroactively invented original actor owner. A new `saveId` identifies each logical save independently of those row IDs.

The same save ID, authenticated actor and normalized intent returns ALREADY_PROCESSED without another examination write, including after a newer deliberate edit. Changed intent returns 409 WRITE_ID_CONFLICT. Another authenticated actor cannot claim or replay the ID. Fresh authorization is rechecked before replay. Validation rules and examination calculations are unchanged.

Receipts are stored permanently in the approved additive `Write_Receipts` tab, in the same batch as the examination effects. They bind operation type, actor reference, payload/precondition hashes, timestamp and response JSON. No automatic tab creation, existing-data migration, or live provisioning was performed.

## Concurrency and failure protections

A shared workbook mutation lock coordinates marks and publication across service instances. Locks have bounded acquisition, a 30-second expiring owner token, owner-checked renewal, and a 120-second ownership budget. Durable dispatch intent survives lease expiry, preventing a late Sheets batch from overlapping another write. Different scopes serialize safely; stale checks are scoped to affected records/results.

Both service and repository compare original expected marks/history against fresh stored state before writing. Revisions require the latest official event, and a historical fingerprint match cannot bypass a current revision. Publication compares calculation content independently of the existing FNV fingerprint; existing fingerprint semantics and Recorded_By are retained.

Reads can retry within configured bounds. Mutations explicitly set both retry=false and retryConfig.retry=0 so shared Google transport configuration cannot re-enable retries. Redis SDK mutation retries are also disabled. Redis/configuration/read failures before dispatch fail closed. Definitive upstream rejection permits a later retry; uncertain timeout/network/5xx outcomes retain the guard and never blindly resend a batch. A visible atomic receipt recovers successful writes after lost responses. An absent receipt alone never establishes failure.

Confirmed commits/replays invalidate the local academic cache; uncertain outcomes invalidate it conservatively. Protected reads now fetch publication history fresh across instances, and older in-flight browser responses cannot replace newer data. Full distributed cache redesign remains out of scope.

## Receipt contract and observability

Successful responses preserve existing fields and add saveId, status (SAVED or ALREADY_PROCESSED), savedCount and the current requestId. Replay preserves original counts/events and uses the current HTTP attempt's request ID. Internal Sheets row coordinates are never exposed.

Existing structured request-ID logging is retained. Write events use hashed operation/actor references, safe codes, counts and dispatch flags rather than student marks or staff identities. The independent write secret is covered by diagnostic redaction.

## Verification actually performed

- `npm test`: **205 passed, 0 failed** on final source. Log: `output/task32-tests.log`.
- `npm run build`: **passed** on final source. Log: `output/task32-build.log`.
- `npm run lint`: **0 errors, 8 preexisting unrelated warnings**. Log: `output/task32-lint.log`.
- `git diff --check`: **passed**.
- Existing grading, authorization, UI characterization and PDF/Excel export tests passed in the full suite.
- Synthetic tests cover repeated/changed saves, actor/row-ID ownership, independent service instances, same/different scopes, stale reads, lease expiry and renewal loss, maximum ownership, late upstream commit, Redis response loss, definite rejection, mixed update/append failure, unknown outcomes, receipt-read failures, publication retry/conflicts/latest-event transitions, no duplicates/overwrites and cache invalidation.
- Local browser verification used the Tabbit skill with actual marks components/hooks, an offline synthetic data fixture and mocked fetch. It did not exercise production APIs or authentication.
- Desktop **1440 ? 1000**: simulated successful upstream save with lost response, then retried the same save. **2 requests, same save ID, 1 synthetic write, 1 replay**, confirmed success feedback and updated value. Screenshot: `output/task32-browser/desktop.png`.
- Mobile **390 ? 844**: simulated a stale-state conflict. The error was visible, the changed draft value was retained and the synthetic write count remained **1**. Screenshot: `output/task32-browser/mobile.png`.
- Browser screenshots were visually inspected, the temporary test tab was closed, task ownership was released, and the local harness server was stopped.

The build reported existing lint warnings and a nonfatal Google Fonts stylesheet optimization/download warning. No connected workbook, real examination record, or Redis coordination state was touched.

## Remaining limits and operational prerequisites

1. Writes fail closed until the approved receipt tab, environment settings and Redis ready sentinel are provisioned for the selected environment. Follow `task-3.2-write-safety.md`; this task has not provisioned them.
2. Manual Sheet edits bypass Redis. Fresh comparisons detect earlier edits, but the Sheets API cannot atomically fence administrator changes between final comparison and commit, including row sorting/insertion/deletion. Use coordinated maintenance windows and protect receipts.
3. An unresolved dispatch intentionally blocks new workbook mutations until its receipt is visible or an administrator establishes the original request can no longer commit and resolves its outcome. No unsafe automatic expiry-based recovery or destructive cleanup tool was added.
4. Coordination assumes durable Redis state, no eviction, one stable namespace/secret across all writers and retained protected receipts. Arbitrary partial key loss or receipt tampering is not automatically recoverable. Do not rotate namespaces/secrets or restore Redis while writers are active.
5. Workbook-wide serialization trades throughput for a smaller safe implementation. Receipt reads grow with operation history. Future cache/performance work has not been started.
6. Legacy drafts lacking an original expected-state baseline require cancel/refresh/review. Fresh validation may deny a marks replay if current prerequisite data has become invalid; no validation rules are weakened to recover a receipt.

The user approved the local Task 3.2 commit after reviewing completion. Nothing has been pushed, merged or deployed.

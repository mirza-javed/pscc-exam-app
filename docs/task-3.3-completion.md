# Phase 3 - Task 3.3 completion

Implemented the approved four-endpoint incremental migration locally. No commit, push, merge, deployment, live Sheets/Redis access, storage/schema migration, or Task 3.4 work was performed. Existing Tasks 3.1/3.2 and preexisting untracked PDF/output artifacts were preserved.

## Endpoints and contracts

| Endpoint | Purpose | Filters |
| --- | --- | --- |
| GET /api/academic-config | Authorized schemes, grading, grade/section selectors, fallback subject configuration and sanitized administrator preview choices | grade, academicSession, examId, refresh |
| GET /api/students | Authorized rosters and cross-grade cadet search | grade, section, kitNo, search, limit, cursor |
| GET /api/marks | Independent scoped marks reads; POST unchanged | grade, section, examId, academicSession, subject, kitNo, limit, cursor |
| GET /api/analytics-data | Complete cohort inputs for analytics and result cards | required grade/section; optional academicSession/examId |

All four accept previewTeacherId. Unknown/repeated parameters, empty supplied values, control characters, excessive lengths, invalid limits and malformed cursors fail safely. section=ALL requires grade and the existing authoritative full-grade eligibility check. Omit cohort examId for All Exams. Session aliases use getAcademicSession; stored identifiers, marks/absence values, Exam_Order, exact scheme interpretation and maximum-mark rules are retained. No student active-status filter is added because no authoritative active-status schema exists.

New nonpaginated success: `{ success: true, data, requestId }`.
Paginated success: `{ success: true, items, nextCursor, hasMore, requestId }`; students also include filtered duplicate-Kit warnings.
Failure: `{ success: false, error, code, requestId }`, with safe messages and request-ID headers. Auth, query, forbidden scope, missing exam configuration, stale cursor and unexpected failures retain distinct HTTP status/code contracts. Authorized collections without matches return empty successes.

Configuration does not transfer student or marks rows, cache internals, or arbitrary scheme/grading metadata. The real administrator's sanitized staff choices and Preview_Assignments remain separately available for the authorized View As control; academic records always follow the server-resolved effective user's scope.

## Authorization and cache behavior

Every HTTP read resolves authenticated email, checks the bounded rate policy and rereads current staff approval/teaching assignments. Unknown roles fail closed. Projection uses existing canReadStudent/canReadMark permissions, with explicit grade/section denials and filtered record joins before delivery. Subject filters narrow reads; teachers retain existing full-subject read access within authorized sections. Subject-specific write restrictions remain in the unchanged Task 3.2 write services.

Preview requires global read permission and a unique active recognized staff target. ALL eligibility uses every section in the fresh authoritative roster, including sections absent from the requesting user's projected data. Results combine the entire authorized cohort and preserve cadets' real sections. No section summaries or partial-page ranks are introduced.

New resources read selected prerequisite tabs fresh; they do not call loadMasterDatabase or cache projected responses. HTTP responses are private/no-store. Existing compatibility master-cache behavior and post-write invalidation remain intact. Optional scoped-read rate-limit settings default to 120 reads per five minutes per actor, independently of existing write/refresh budgets.

Publication inputs preserve source order and the existing authoritative Result_Key interpretation, even when legacy descriptive session/exam fields disagree. Matching history is complete for selected result keys, preserving display state and Task 3.2 publication baselines.

## Pagination

Students default to 50 rows (maximum 200); marks default to 250 (maximum 1,000). Ordering uses normalized identifiers with source-position tie-breakers for duplicates. Rows and legacy duplicates are not silently deduplicated. Cursors bind resource, authenticated/effective scope, permission context, canonical filters/page limit and dataset revision. Equivalent query parameter ordering is accepted. Each page reauthorizes independently. Changed relevant data returns 409 PAGINATION_STALE; restart without a cursor. Cursors never confer authorization.

Configuration and cohort inputs are unpaginated. Sheets still reads/scans selected tabs; this is response pagination, not indexed storage pagination.

## Frontend migration and retained routes

- Home bootstraps configuration, rather than downloading the full database.
- Navbar/preview choices use configuration metadata.
- Analytics fetches its selected grade/section/exam/session cohort.
- Result cards use complete cohorts; name/Kit search requests at most ten authorized students after a short debounce.
- PDF/Excel actions use existing shared calculations/models.
- Marks entry lazily loads /api/database when opened, retaining original draft, Submission_ID and expected-state behavior.
- Save callbacks refresh relevant scoped resources; marks saves also refresh the compatibility data.

The client API layer allowlists/encodes queries, validates success contracts, propagates cancellation and surfaces safe status/code/request-ID errors. Hooks bind responses to identity, preview, filters and request generation, discard older responses, hide old cohorts during scope changes and clear disabled session data. Search-selected cadets survive delayed cohort loading.

Retained: /api/database, /api/staff-session, /api/auth/[...nextauth], POST /api/marks and POST /api/result-publications. Write save IDs, persistent Submission_ID ownership, receipts, ALREADY_PROCESSED, conflicts, request IDs and coordinated storage behavior are unchanged.

## Payload measurements

Run `node scripts/measure-scoped-payloads.mjs`. It uses only synthetic data and no external services. Scenario: 480 students, four grades, three sections per grade, three exams, six subjects, 8,640 marks, and no publication history. Measurements are serialized, uncompressed JSON with a synthetic request ID; they are not production network measurements.

| Response | Bytes |
| --- | ---: |
| Compatibility global database | 1,055,612 |
| Configuration bootstrap | 9,013 |
| One 40-student section | 3,861 |
| One section/exam marks, all six subjects | 27,936 |
| One section/exam/subject marks | 4,696 |
| Single-exam analytics inputs | 32,494 |
| All Exams analytics inputs | 89,548 |
| Bootstrap plus single-exam inputs | 41,507 |
| Bootstrap plus All Exams inputs | 98,561 |

Including configuration, estimated reduction is 96.1% for one exam and 90.7% for All Exams. Student/marks row width, publication history, authorized scope, compression and navigation frequency change these figures. A marks-entry visit still transfers its compatibility payload. Server tab scans and repeated fresh authorization can add round trips; no backend latency or quota reduction is claimed.

## Narrow export correction

Browser regression checks exposed an existing ALL-section single-exam merit PDF failure: its subject-cell styling used an offset that omitted the added Section column. The renderer now derives the assessment offset from the actual demographic columns. A constructor-compatible named jsPDF import enables the real generator's Node regression test. No table academic values, layout rules, ranking or grading were changed.

## Verification

Final validation: `npm test` passed 229/229 tests with zero failures; `npm run lint` passed with zero errors and eight existing warnings; `npm run build` passed in the isolated local build copy. `git diff --check` passed. Logs are recorded in output/task33-tests.log, output/task33-lint.log and output/task33-build-isolated.log. The full suite covers existing academic rules/exports and Task 3.2 concurrency/idempotency, plus scoped routes/services/client state: authenticated/unauthorized reads, A/B/C restrictions, subject filters versus write scope, ALL eligibility, effective previews, invalid parameters, deterministic/empty/stale/cross-scope pagination, missing resources, fresh record/approval changes, safe errors/request IDs, no-store behavior, malformed client contracts, source-order publication history and exact cohort result equivalence.

Local Tabbit browser verification used actual Home/components/hooks, a synthetic fixture and mocked APIs/authentication. At 1440x1000: synthetic login, A/B/C/ALL analytics, full-cohort ranking/real sections, analytics Excel, corrected analytics PDF, and individual All Exams PDF/Excel. Captured generated files include an ALL-section PDF (112,253 bytes), individual All Exams PDF (81,128 bytes), and Excel workbook (7,637 bytes), with PDF/ZIP signatures checked.

At 390x844: authorized cadet search selected Kit 120 in section C without losing the selection during loading; single-exam publication and marks editing/save completed synthetically. Exactly one synthetic marks write and one publication write occurred. Save IDs and both original-state baselines were present. Calls used scoped resources until marks entry opened, then /api/database and its post-save refresh. No final page script errors or horizontal overflow were observed (document width 384 at viewport width 390). Missing-photo fallbacks worked; existing photo-path/embedding tests remain covered.

Tabbit screenshot capture timed out, so no pixel-level screenshot QA is claimed; browser verification used DOM snapshots, viewport bounds and captured export blobs. Live Google OAuth, connected workbook behavior and production Redis are unverified. The temporary browser tab/task and synthetic HTTP server were closed. Existing user development processes were left running.

The final production build is checked in an isolated local copy with identical application/root configuration source and shared installed dependencies, because a development server was using the root .next directory and a root build hit a missing generated chunk. The build copy is under output/task33-build-app; its temporary copied local environment file is removed after validation. No permanent build configuration changes are introduced.

## Remaining dependency and next step

/api/database remains necessary only for marks-entry supporting reads and their refresh lifecycle, through hooks/useAcademicDatabase.js. Analytics, result cards, exports, startup and preview no longer require that broad response. GET /api/marks is available for the subsequent incremental marks-support migration but is not yet used by that portal.

Next: review this Task 3.3 change and approve a local commit. Later migrate marks-entry supporting reads with explicit draft/baseline regression coverage. Standalone publication-history pagination, indexed storage, active-status semantics and distributed cache redesign remain deferred. Task 3.4 has not started; cache invalidation redesign remains Task 3.5. No commit is created automatically.

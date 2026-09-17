# Codex session summary - 2026-09-17

## Current state

- Tasks 1.1-1.4 remain intact, including server-side authentication, authorization, marks validation, data-integrity checks, and question-paper behavior.
- Task 1.5 result calculation, All Exams reporting, and explicit publication tracking are implemented locally.
- The authoritative policy is `docs/EXAMINATION_RULES.md`. It now contains the confirmed All Exams and historical publication rules.
- No stored marks or live Google Sheets records were changed. Task 1.5 has not been committed or pushed in this session.
- Earlier pushed work includes Task 1.2 commit `a4ba56c` and Task 1.3 commit `0f30dbb` on `origin/main`.

## Task 1.5 result rules

- `lib/examinationResults.mjs` is the central resolver for screen, analytics, PDF, and Excel results.
- A result uses exactly one valid `exam_scheme` row for each `Exam_ID + Grade + Subject`. Missing, duplicate, blank, zero, negative, or non-finite maximums block finalization; there is no fallback maximum.
- Strict marks parsing rejects malformed prefixes, negative values, non-finite values, and values above the scheme maximum.
- Approved absence aliases are normalized. Absence contributes zero obtained marks and the full maximum and forces failure.
- Missing or blank marks make a result incomplete. Incomplete or invalid results do not receive final totals, percentages, grades, pass/fail status, or rank.
- Identical duplicate marks collapse logically; conflicting duplicates produce `DUPLICATE_CONFLICT` and require correction.
- Each subject must reach 40%; exactly 40% passes. Conduct is treated as a normal component and displayed last.
- The college-wide scale is centralized in `lib/grading.js`: A++ 95, A+ 90, A 85, B++ 80, B+ 75, B 70, C 60, D 50, E 40, and U below 40. A configured `Grading_System` is validated and used when valid; ambiguous or overlapping rules fail closed.
- Ranking includes only complete, valid results, including complete failed results. It orders by percentage and then obtained marks, with exact ties sharing rank.

## All Exams

- All Exams requires one Grade/Class and one Academic Session/Year.
- Only exams with valid `exam_scheme` entries for that same grade and session are included. Exams from different sessions are never mixed.
- Each exam keeps its identity and separate subject obtained/maximum marks in the UI and exports.
- Grand Total Obtained and Grand Maximum are sums across all included exams. Overall Percentage is `Grand Total Obtained / Grand Maximum`; no averaging or weighting is applied.
- The overall grade uses the standard college-wide scale. Existing absence, incomplete, pass/fail, duplicate, and exact-maximum rules apply across the combined result.

## Publication tracking

- Publication status is never inferred from dates, marks, exports, or historical rows. Untracked results receive no Published or Revised label.
- The smallest safe addition is the append-only `Result_Publications` sheet with columns:
  `Publication_Event_ID, Result_Key, Kit_No, Grade, Section, Academic_Session, Result_Scope, Exam_ID, Result_Status, Calculation_Fingerprint, Policy_Version, Recorded_At, Recorded_By, Prior_Event_ID, Revision_Reason`.
- Supported events are Draft, Published, and Revised. A matching latest fingerprint controls the displayed status; changed results after an official event are shown as `UNPUBLISHED_CHANGES`.
- `POST /api/result-publications` reloads fresh source data and recomputes the result server-side. It does not trust client totals or status.
- Only roles with the existing `canWriteAllMarks` authority can record publication events. Published/Revised require a complete valid result. Revised also requires a prior official event, a changed fingerprint, and a revision reason.
- The storage layer validates the sheet schema and transition again, creates the actor and timestamp server-side, handles event-ID conflicts/idempotency, appends with RAW input, and never changes `Marks_Log`.

## UI, exports, and authorization

- Analytics and result cards now support a session selector and All Exams per-exam subject columns/rows.
- Screen, PDF, and Excel use shared presentation data from `lib/resultPresentation.mjs` so obtained marks, maximums, totals, grades, and status agree.
- PDF displays `REVISED RESULT` only for a matching explicit Revised event and `NOT FINAL` for incomplete or invalid results.
- Marks Entry blocks entry when a single exact valid maximum is unavailable.
- Subject teachers may read all marks for an assigned class/section and scheme subjects for their assigned grade so overall class analytics can be calculated. Their marks writes remain limited to assigned subjects through the existing server checks.
- Existing class-teacher, section-head, administrator, preview, and mutation controls remain enforced. Publication rows are projected only for students visible to the requester.

## Main files

- Policy and schema guidance: `docs/EXAMINATION_RULES.md`, `docs/exam_scheme_template.csv`, `docs/result_publications_template.csv`, and the root `README.md`.
- Result calculation and formatting: `lib/examinationResults.mjs`, `lib/grading.js`, `lib/analytics.js`, `lib/resultPresentation.mjs`, `lib/pdfGenerator.js`, `lib/models.js`.
- Publication storage/API: `lib/googleSheets.js`, `app/api/result-publications/route.js`.
- UI: `components/Analytics/AnalyticsDashboard.jsx`, `components/Reports/CadetResultCards.jsx`, `components/MarksEntry/MarksEntryPortal.jsx`, `app/page.js`.
- Authorization: `lib/authorization.mjs`.
- Coverage: `tests/examination-results.test.mjs`, `tests/result-publications.test.mjs`, `tests/authorization.test.mjs`.

## Validation performed

- `node --test tests/*.test.mjs`: 65 passed, 0 failed.
- Coverage includes strict maximums, every absence alias, missing/blank marks, duplicate handling, session-scoped All Exams, preserved exam identities, grand totals, pass thresholds, grades, ranks/ties, Conduct, shared output formatting, publication appends/schema checks/conflicts, and authorization boundaries.
- `npm run build`: passed, including `/api/result-publications`. Google Fonts download optimization emitted a non-fatal network warning.
- `git diff --check`: passed apart from line-ending warnings.
- The local app compiled and served successfully on port 3001. Protected manual UI verification could not be completed because `/api/staff-session` returned 401 without an authenticated account and browser automation could not attach reliably. The temporary port 3001 server was stopped; the existing port 3000 process was not touched.

## Deployment and migration handoff

1. Add and populate `Academic_Session` in the production `exam_scheme` sheet using `docs/exam_scheme_template.csv`. All Exams remains unavailable for records whose session cannot be established safely.
2. Create the append-only `Result_Publications` sheet using `docs/result_publications_template.csv` before enabling publication actions.
3. Do not backfill or infer historical publication events. Record future Draft, Published, and Revised transitions explicitly.
4. Verify authenticated desktop/mobile result views and PDF/Excel exports against staging data after the sheet schema is deployed.
5. Review and commit the Task 1.5 changes, including this summary, when ready.

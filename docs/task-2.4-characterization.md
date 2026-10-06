# Task 2.4 behavior characterization

Baseline: locally committed Tasks 2.1–2.3, before Task 2.4 extraction.
Scope: structural extraction only. Academic policy, API contracts, permissions,
draft semantics, fetch ordering, CSS, and export generators remain unchanged.

## AnalyticsDashboard (1,085 lines)

- Grade options come from projected Students, numerically sorted, with 9–12 fallback.
  Initial grade is the first option; section starts A; exam starts All Exams.
- Exams retain scheme insertion order, with All Exams first. Sessions are sorted
  descending; an unavailable selected session resets to the first configured one.
- Sections come from the selected grade, sorted, with A/B/C fallback. ALL is offered
  only for multiple sections and an explicit fullGradeRead authorization flag.
  An unavailable selected section resets to the first authorized option.
- buildClassAnalyticsData owns calculations, ranking, ties, KPIs, subjects, chart
  series, top/bottom performers and support roster. ALL uses grade-wide rankings.
- Search matches kit/name/group, plus section in ALL mode. Sorting toggles direction
  for the current column and starts ascending for a new column; absent/null numeric
  assessment totals sort as -1. Search/sorting do not recalculate merit ranks.
- All Exams table consumes buildCombinedAllExamsModel and formatAggregateFraction.
- Performer photos use CadetPhoto with kit/name, performer size and lazy loading.
- PDF/Excel receive the complete meritGrid, not the searched/sorted display grid.
  Both preserve grade, section, exam, session and model columns; PDF also gets KPIs
  and subject averages. Empty results disable export controls.

## CadetResultCards (1,131 lines)

- Grade/section defaults mirror the existing report code; exams are sorted (unlike
  analytics), with All Exams selected initially. Session fallback is unchanged.
- Global kit/name search uses projected Students, legacy field fallbacks, and ten
  suggestions. Enter chooses the first suggestion or exact kit fallback. Choosing a
  cadet changes grade/section/kit, hides suggestions, and selects single mode.
- The merit-grid effect selects its first cadet if the current kit is unavailable;
  empty grids clear selection. Previous/next stop at the cohort boundaries.
- Single and batch cards share calculated results. Single-exam assessment formatting
  and All Exams matrix use centralized presentation helpers. Summary, rank, status,
  draft/published/revised and unapproved-change labels retain their existing values.
- Photos remain kit-based, eager for single mode and lazy for batch mode. Preserve
  all narrow-width classes, scrollable matrix region, tabIndex, print classes and
  page-break wrappers.
- PDF single/batch actions retain existing arguments, progress and alerts; Excel
  retains individual-model inputs. Print waits for photos (load/error or two-second
  timeout) before window.print and relies on existing global print isolation.
- Sharing tries a PDF File through native Web Share; cancellation returns. Fallback
  downloads the PDF and opens WhatsApp Web with the existing summary. No send occurs.
- Publication requires canWriteAllMarks and no preview. Revised requires a nonempty
  prompt reason. Keep request fields, error reference, awaited refresh and timers.

## MarksEntryPortal (1,071 lines)

- Exam options combine schemes and grading rows, sorted, with existing hardcoded
  fallback. Grade/section/subject options preserve admin/class-teacher/assignment
  branches; section/subject synchronization retains existing dependencies.
- Roster filters grade/section and subject group. Maximum resolution uses the shared
  exact scheme lookup. Duplicate kits come from Authorization_Issues and are disabled
  and excluded from counts, templates, imports and save records.
- Hydration reads Marks_Log by exam/subject and kit, records Submission_IDs,
  canonicalizes historical absence, sets edit mode, then merges the selected draft.
  Selection or db changes rerun this hydration. Do not narrow its matching here.
- Draft key is draft_exam_grade_section_subject (no user/expiry). updateScore writes
  the entire next map from its functional updater, swallowing storage errors. Import
  directly changes marksState and does not invoke draft persistence. Cancel restores
  database marks, clears draft and exits edit mode. Success clears draft; failure does
  not. All of these semantics are intentionally preserved.
- Explicit Absent renders AB; toggling back clears and focuses the input. Blank is
  not absent. Strict decimal parsing accepts zero and rejects malformed input.
- Enter/Down focuses the next filtered roster input; Up focuses the previous one.
  Navigation uses kit-keyed refs and does not skip disabled/absent rows.
- Import reads the first worksheet, accepts existing normalized ID/marks header
  aliases, merges nonblank rows, skips duplicate kits and retains raw imported marks.
  Template is an XLSX workbook despite the historical CSV comment.
- Save blocks preview, missing/ambiguous maximum, empty roster and invalid present
  scores in the current order. Payload preserves prior Submission_ID, explicit
  attendance, selection fields and numeric text. API remains authoritative.
- Keep server detail/request-reference errors, saved count/message, progress labels,
  edit lock after success and the existing non-awaited onMarksSaved callback.

## Page (196 lines) and store (98 lines)

- Bootstrap fetches staff-session with no-store; cancellation guards store updates
  and checkingSession completion. Approved session sets user/permissions; failure
  logs out. Google sign-in/sign-out remains in existing login/navbar components.
- Database fetch runs after authenticated bootstrap and preview ID changes; refresh
  sets refresh=true. Keep loading versus refreshing, error reset, 401 logout, request
  reference errors, retained dbData and finally behavior. No cancellation is added.
- Analytics is the default tab. Switching modules unmounts the previous feature.
  Navbar refresh, marks save and publication refresh retain existing semantics.
- Theme applies the dark class on mount/change. Session and preview are transient;
  preview is effective only for real admins, and logout clears both contexts.
- Only theme persists: pscc_auth_session, version 2, migration fallback light.
  Separation must retain this key/version and exclude permissions/academic data.

## Verification approach

Before extraction: executable React characterization using synthetic data and
mocked fetch/storage/export adapters, plus existing domain/export tests. After each
checkpoint: focused tests and production build. Final: full Node suite, lint,
touched-file formatting, build and local desktop/375px/430px browser checks.

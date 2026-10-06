# Phase 2 — Code Quality and Architecture Audit

**Date:** 2026-10-06 (Asia/Karachi)  
**Status:** Task 2.1 documentation completed under user approval; review and commit approval pending. Tasks 2.2-2.4 remain recommendations only.  
**Scope:** Current Next.js repository after Phase 1 and recent feature work.

## Audit outcome and validation

The audit-only findings and validation below are retained as historical baseline notes. Task 2.1 completion is recorded in section 3; later task recommendations remain unapproved.

Phase 2 should be an incremental refactor of the existing Next.js application. Much of the academic and security logic is already centralized; preserve those implementations and improve their boundaries.

No application files were changed during the audit. All **86 existing tests passed** using `node --test tests/*.test.mjs`. A production build, browser workflows, and live Sheets operations were not performed.

The existing changes to `docs/codex-session-summary.md` and untracked `output/` were left untouched. This document records the audit findings; it does not authorize implementation.

### Constraints

- Preserve Phase 1 Tasks 1.1–1.6 and all current tests.
- Do not change authentication, RBAC, examination policy, ranking, analytics outcomes, marks behavior, exports, or deployment behavior.
- Do not redesign the database or migrate away from Google Sheets in Phase 2.
- Preserve `docs/EXAMINATION_RULES.md` as the authoritative academic policy.
- Wait for approval before implementation.

## 1. Current architecture summary

The application has five API route modules: authentication, staff session, database reads, marks writes, and result publication.

| Area | Current owner | Assessment |
|---|---|---|
| Authentication | `auth.js`, `lib/staffAuth.js`, `lib/staffApproval.mjs` | Established Google identity and fresh staff approval boundaries |
| Authorization | `lib/authorization.mjs`; `lib/rbac.js` re-export | Shared role and scope logic; server enforcement present |
| HTTP security | Request-body, forgery, rate-limit, context, and API-error modules | Already separated substantially |
| Storage | `lib/googleSheets.js` | Credentials, discovery, parsing, caching, reads, write planning, and publication checks combined |
| Academic calculations | `lib/examinationResults.mjs`, `lib/grading.js`, `lib/academicRules.mjs` | Central authoritative calculation path already exists |
| Analytics | `lib/analytics.js` | Consumes resolved results; also attaches publication state |
| Result presentation | `lib/resultPresentation.mjs` | Shared models used by UI and exports |
| Exports | `lib/pdfGenerator.js`, `lib/excelResultGenerator.mjs` | Generators separated from portals; PDF module remains large |
| Browser state | `lib/store.js`, page and portal state | Session context, preview, and theme share a store; data and drafts remain elsewhere |

Current flow:

```text
API routes → staff/security helpers + domain functions + googleSheets
Page → projected academic data → feature portals
examinationResults → analytics / resultPresentation → UI / PDF / Excel
```

The result architecture should be retained, not rebuilt.

## 2. Main code-quality problems

- Routes still orchestrate storage, authorization, validation, and business decisions directly.
- `googleSheets.js` has too many responsibilities and no explicit `server-only` import.
- Publication transitions are checked in both the route and repository-like storage code.
- Generic normalization lives inside the authorization module, coupling academic calculations to RBAC.
- Normalization, numeric parsing, absence handling, scheme lookup, and filter-option construction overlap.
- Three feature portals each exceed roughly 1,000 nonblank lines.
- Test coverage is useful, but some API checks inspect source text rather than execute handlers.
- ESLint and formatting are not configured reproducibly.
- Some documentation and unused compatibility helpers remain stale.

These are architectural findings, not evidence that Phase 1 is broken.

## 3. Task 2.1 — Architecture ownership and documentation

**Completed 2026-10-06 (documentation only):** README now describes supported authentication, RBAC, marks, analytics, result cards, and PDF/Excel exports. `docs/architecture.md` and `docs/deployment.md` document current ownership and deployment operations. The stale session-summary question-paper reference was corrected while preserving existing edits; historical migration documentation was retained. The roadmap records completion. No application logic, dependencies, deployment commands, Sheets data, or examination policy were changed.

**Task 2.1 verification:** `node --test tests/*.test.mjs`: 86 passed, 0 failed. `npm run build`: passed; Google Fonts stylesheet download/optimization produced a non-fatal warning. Documentation was checked against current modules, all example environment names, and relative links; `git diff --check` passed. No live deployment or Sheets operations were performed. No commit was made; user approval is pending.

**Next.js is confirmed as the single supported runtime.** Package scripts and Vercel configuration target Next.js. No tracked Python files, Streamlit configuration, or requirements files appeared in the inventory.

The following table preserves the original audit proposals; Task 2.1 documentation work above has now been completed.

| File | Finding and proposed change |
|---|---|
| `README.md` | Remove the unsupported Word-export claim; describe actual PDF/Excel flows and architecture ownership |
| `docs/codex-session-summary.md` | Correct the current-state reference to “question-paper controls”; preserve historical validation notes and pending user edits |
| `docs/improvements_recommended_by_codex.md` | Keep runtime retirement marked complete; identify the remaining 2.1 documentation work |
| `docs/architecture.md` — proposed | Document layers, import boundaries, cache behavior, and authoritative rule owners |
| `docs/deployment.md` — proposed | Document the existing deployment, environment configuration, validation, and rollback procedure |

The historical UI migration document already labels Streamlit and question-paper material as historical. It does not need a wholesale rewrite.

Deployment configuration currently uses `npm install`, while local guidance uses `npm ci`. Document the current behavior; changing deployment commands belongs in a separately approved deployment task.

**Priority:** High. **Risk:** Low.

## 4. Task 2.2 — API/service/repository separation

Recommended ownership:

```text
Route: HTTP and security boundary
    ↓
Service: authorized business workflow
    ↓
Repository: reads, persistence, storage safeguards
    ↓
Google Sheets client
```

Shared pure academic functions remain usable by services and browser presentation.

| Existing module | Recommended responsibility |
|---|---|
| `app/api/marks/route.js` | Retain origin checks, rate limiting, session lookup, body parsing, logging, and response mapping |
| Marks service — new | Coordinate fresh reads, scope checks, validation, persistence, and save receipt |
| `app/api/database/route.js` | Parse refresh/preview parameters and return the existing response |
| Academic-data service — new | Resolve permitted preview context, fresh protected records, and database projection |
| `app/api/result-publications/route.js` | Retain HTTP/security responsibilities |
| Publication service — new | Validate requests, resolve results, evaluate publication transitions, and construct events |
| `lib/googleSheets.js` | Initially serve as a compatibility facade; gradually delegate to repositories |
| `lib/staffAuth.js` | Remain the server session/approval adapter |
| Domain modules | Remain free of HTTP, credentials, and Sheets SDK dependencies |

### Preservation requirements

- Preserve marks authorization-before-detailed-validation behavior and its existing error precedence.
- Preserve fresh staff, assignment, and protected-record reads.
- Preserve one atomic marks update/append batch and submission-ID ownership checks.
- Keep repository prerequisite reads and defensive checks.
- Preserve current cache metadata, response shapes, messages, statuses, and headers.
- Avoid a universal route wrapper initially. Auth.js handling differs from custom APIs.

### Server/client boundaries and dependencies

**Critical architecture cleanup:** Guard credential/storage entry points against client imports.

`staffAuth.js` already imports `server-only`; `googleSheets.js` does not. Current client imports reviewed do not directly reach Sheets access, but the boundary needs enforcement. Introduce this alongside a test-compatible adapter structure: directly adding the guard would affect Node tests importing `googleSheets.js`.

`auth.js → staffAuth.js → dynamic import(auth.js)` is a deliberate runtime dependency loop. Document it; do not replace the dynamic import with a static import casually. This finding is not a claim that a complete automated dependency-cycle scan was performed.

**Priority:** Critical boundary enforcement; High service/repository extraction.  
**Risk:** Medium–High, particularly marks and publication workflows.

## 5. Task 2.3 — Central domain rules and contracts

`docs/EXAMINATION_RULES.md` remains authoritative.

| Concept | Current definition | Recommendation |
|---|---|---|
| Exam identifiers and sessions | Result engine, validators, models, portal selectors | Shared identifier helpers and documented session aliases |
| Grade, section, `Kit_No` | Storage aliases, authorization normalization, UI comparisons | Document display values versus comparison keys |
| Absence | Result-engine constants; marks-entry legacy set | Share legacy absence recognition |
| Missing/invalid/not applicable | Result engine and presentation module | Central constants and explicit contracts |
| Scheme resolution | Result engine, marks validator, `models.js` | Share exact matching primitives; preserve caller-specific errors |
| Grading | `grading.js` | Keep this owner; document configured-scale and fallback behavior |
| Ranking | Result engine; bottom-ranking logic in analytics | Share comparison/tie helpers after characterization |
| Result status | Result engine and presentation | Keep academic status separate from publication status |
| Publication state | Analytics, publication route, Sheets writer | Extract pure publication helpers with preserved semantics |
| Authorization scopes | `authorization.mjs` | Retain one owner and distinct read/write capabilities |
| API payloads | Route construction and validators | Add JavaScript/JSDoc contracts |
| Sheet rows | Parser aliases and writer header arrays | Document raw rows versus normalized application rows |
| Presentation models | `resultPresentation.mjs` | Retain and extend its existing ownership |

### Concrete inconsistencies

- `normalizeValue()` applies Unicode normalization and collapses internal whitespace; storage normalization does not consistently use the same transformation.
- Storage composite keys use `___`; validation/result keys use null separators.
- Portals sometimes compare trimmed identifiers case-sensitively while domain logic uses normalized comparison.
- Portal options can fall back to `Exam_Name`, but authoritative resolution matches `Exam_ID`.
- Marks entry also derives exam options from `Grading_System` and hardcoded defaults.
- Analytics has a hardcoded grade-distribution list despite configurable grading.
- Publication display sorts events by timestamp with row-order fallback; the publication route selects prior official events by row order.

**Do not silently reconcile these differences during extraction.** First characterize current behavior. Any correction that changes accepted identifiers, selected options, publication precedence, or analytics output requires separate approval.

Submission validation must also retain its explicit attendance contract; it should not simply accept every legacy absence token supported by historical result calculations.

**Priority:** High. **Risk:** High for normalization and calculation changes.

## 6. Task 2.4 — UI, state, and large components

| Component | Responsibilities currently combined | Suggested extraction |
|---|---|---|
| `AnalyticsDashboard.jsx` | Options, selections, search, sorting, charts, performer cards, tables, exports | Filter hook, merit-grid hook, filters, charts, performer cards, table, export actions |
| `CadetResultCards.jsx` | Search, selection, navigation, single/batch rendering, printing, sharing, exports, publication | Cadet-selection hook, card component, batch view, report actions, publication action hook |
| `MarksEntryPortal.jsx` | Permission options, roster, duplicate detection, existing marks, drafts, editing, keyboard navigation, import, validation, save | Entry hook, draft hook, workbook parser, filters, grid, import panel, save actions |
| `app/page.js` | Session bootstrap, theme application, database fetching, preview refresh, tabs, loading/errors | Session hook, academic-data hook, focused portal shell |
| `lib/store.js` | Session context, effective preview, theme persistence | Session/preview store and preference store |

### State ownership

- **Session/preview:** transient client context populated from the server.
- **Academic data:** page-level fetching hook; continue passing the projected data.
- **Preferences:** persisted theme store.
- **Drafts:** marks-specific local hook.
- **Filters/selections:** feature-local state.
- **Export/publication progress:** action-specific state.

Only theme is currently persisted in Zustand. Do not misclassify the current implementation as persisting authentication credentials or permissions.

Draft keys currently omit user identity. Extracting draft code can preserve that behavior, but changing isolation, expiry, or recovery is a separate behavioral task already identified in the roadmap.

Database fetching lacks cancellation/version protection comparable to the session-bootstrap effect. Extract it faithfully first; defer changes to response ordering and recovery behavior.

**Priority:** Medium; High for marks-component maintainability.  
**Risk:** Medium–High because lifecycle and state reset behavior matter.

## 7. Exact existing files likely to change

The proposed implementation scope is:

- Documentation: `README.md`, `AGENTS.md`, `docs/codex-session-summary.md`, `docs/improvements_recommended_by_codex.md`.
- Routes: `app/api/database/route.js`, `app/api/marks/route.js`, `app/api/result-publications/route.js`.
- Storage/security adapters: `lib/googleSheets.js`, `lib/staffAuth.js`.
- Domain: `lib/authorization.mjs`, `lib/examinationResults.mjs`, `lib/marksValidation.mjs`, `lib/models.js`, `lib/analytics.js`, `lib/writeValidation.mjs`.
- UI/state: `app/page.js`, `lib/store.js`, `components/Analytics/AnalyticsDashboard.jsx`, `components/Reports/CadetResultCards.jsx`, `components/MarksEntry/MarksEntryPortal.jsx`, `components/Auth/LoginScreen.jsx`, `components/Layout/Navbar.jsx`, `components/Layout/HeroHeader.jsx`.
- Exports: `lib/pdfGenerator.js`; `lib/excelResultGenerator.mjs` only where shared contracts require it.
- Tooling: `package.json`, `package-lock.json`.
- Tests: `tests/authorization.test.mjs`, `tests/api-authorization.test.mjs`, `tests/api-security.test.mjs`, `tests/marks-validation.test.mjs`, `tests/google-sheets-writes.test.mjs`, `tests/result-publications.test.mjs`, `tests/examination-results.test.mjs`, `tests/analytics.test.mjs`, `tests/pdf-generator.test.mjs`, `tests/excel-generator.test.mjs`, and related security tests where imports change.

Keep `auth.js`, the Auth.js route, deployment files, and academic policy unchanged unless a specific extraction makes a minimal import adjustment necessary.

## 8. Proposed new files/modules

Create these incrementally, not all at once:

```text
docs/architecture.md
docs/deployment.md

lib/services/marksService.mjs
lib/services/academicDataService.mjs
lib/services/resultPublicationService.mjs

lib/repositories/googleSheetsClient.js
lib/repositories/academicRepository.js
lib/repositories/marksRepository.js
lib/repositories/resultPublicationRepository.js
lib/repositories/sheetRows.mjs

lib/domain/identifiers.mjs
lib/domain/resultStates.mjs
lib/domain/markValues.mjs
lib/domain/publications.mjs
lib/contracts.mjs

hooks/useStaffSession.js
hooks/useAcademicDatabase.js
hooks/useAcademicFilters.js
hooks/useMarksEntry.js
hooks/useMarksDraft.js
hooks/useCadetSelection.js

lib/client/marksWorkbook.mjs
lib/preferencesStore.js
```

Focused components should live beside their feature portals. Use plain JavaScript and JSDoc; a new schema dependency is not necessary initially. Final component filenames should follow the specific approved extraction rather than creating unused scaffolding.

## 9. Refactoring order, priority, and risk

| Order | Work | Classification | Risk |
|---|---|---|---|
| 1 | Document current ownership and correct stale claims | High priority | Low |
| 2 | Add meaningful service/route characterization tests | High priority | Low |
| 3 | Establish storage adapter and enforce server-only boundary | Critical architecture cleanup | Medium |
| 4 | Extract database-read service | High priority | Medium |
| 5 | Extract marks service/repository without changing write planning | High priority | High |
| 6 | Extract publication workflow and shared transition helpers | High priority | High |
| 7 | Introduce contracts; extract domain primitives incrementally | High priority | High |
| 8 | Extract presentation components and feature hooks | Medium priority | Medium |
| 9 | Separate preferences and draft ownership | Medium priority | Medium |
| 10 | Remove verified unused helpers; split PDF rendering if useful | Medium priority | Low–Medium |
| 11 | Broader naming cleanup or generalized abstractions | Nice to have | Low–Medium |

Configure linting early, but apply formatting and fixes in focused increments.

## 10. Minimum useful tooling

- Compatible ESLint and Next.js configuration.
- Unused-variable/import reporting and React Hooks dependency checks.
- Restricted imports enforcing client/server boundaries.
- Prettier matching two spaces, double quotes, and semicolons.
- `npm test`, `lint`, and `format:check` scripts.
- A dependency-cycle check focused on unexpected cycles.

Investigate hook warnings individually; automatic dependency fixes can change fetching and state behavior. Avoid a repository-wide formatting rewrite.

Candidate unused code, with no consumers found in the reviewed application/tests:

- `resolveExamSchemeSpecs()` — contains obsolete cross-exam/default-100 fallback logic.
- `appendMarksLog()` compatibility wrapper.
- PDF single-card alias exports: `generateSingleResultCardPDFBlob` and `downloadSingleResultCardPDF`.
- `normalizeRequiredText()`.

Remove only after repository-wide consumer verification. Keep SheetJS: marks imports/templates still use it. ExcelJS already loads dynamically for result exports.

## 11. Changes that can proceed independently

- Documentation cleanup.
- Tooling configuration and baseline reporting.
- Service characterization tests.
- Pure presentation-component extraction within separate features.
- Verified dead-code removal.

Coordinate normalization, storage splitting, and service extraction because they share keys and imports. Coordinate store changes across all consumers. Independence does not replace the requirement for implementation approval.

## 12. Required regression coverage

Preserve every current test and supplement the existing source-text API checks with executable service/handler tests.

| Refactor | Required verification |
|---|---|
| Routes/services | Origin, rate limit, session, fresh approval, scope enforcement, status/error precedence, request IDs and headers |
| Marks repository | Failed-read/no-write behavior, duplicate handling, ID ownership, preserved IDs, atomic batch, safe cell values |
| Domain helpers | Absence versus missing/zero/invalid, exact maximums, ordering, completeness, grading, ties and eligibility |
| Publications | Draft/publish/revise transitions, unchanged fingerprints, explicit history, idempotency, failure mapping |
| UI/state | Login/logout, preview, refresh, filter reset, drafts, keyboard entry, import/save, publication actions |
| Exports | Shared values, columns, ordering, status/grade separation, photos, page layout and downloads |

Frontend changes require a production build and desktop/mobile workflow checks. Export changes also require visual review; existing PDF tests verify generation/models, not complete layout fidelity.

Test data must remain synthetic. Any staging write verification requires staging records, never production examination records.

## 13. Recommendations to defer

- Database redesign or migration away from Google Sheets.
- Durable concurrency coordination and distributed cache changes.
- New resource endpoints or changed API payloads.
- Draft isolation/expiry and fetch-race corrections.
- Academic-policy, ranking, publication-precedence, or analytics corrections.
- TypeScript conversion, framework upgrades, and new state/query frameworks.
- Broad performance optimization and deployment-command changes.

**Task 2.1 documentation is complete, pending review and commit approval. Tasks 2.2, 2.3, and 2.4 remain unstarted and require separate user approval.**

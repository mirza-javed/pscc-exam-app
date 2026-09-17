# Improvement roadmap recommended by Codex

Prepared: 2026-09-12

This roadmap is based on the repository review and the findings discussed in the conversation. It prioritizes security, marks integrity, and recoverability before architecture, interface, and performance work. This document proposes changes only; application code has not been modified as part of preparing it.

The roadmap applies to the Next.js application, which is the repository's single supported runtime. The former Python/Streamlit implementation was retired after an explicit product decision. Existing mobile navigation, cadet search, and local drafts should be improved rather than rebuilt.

## Planning conventions

- **Priority:** P0 = release blocker; P1 = high priority; P2 = planned improvement.
- **Estimated complexity:** Small = localized change; Medium = coordinated changes across several files; Large = substantial cross-layer work or migration. These are relative estimates, not calendar commitments.
- **Risk level:** Low / Medium / High describe implementation and rollout risk, including disruption to staff access, existing records, or result correctness. Priority separately expresses urgency.
- **Recommended implementation order:** task IDs give the default sequence. Dependencies override that sequence where stated. Focused regression tests must accompany earlier fixes; testing does not wait until Phase 5.
- **Files affected:** paths are relative to the repository root. Paths marked **new** are proposed, not existing files. Wildcards identify the relevant files within a directory, not a requirement to change every file.
- Validate changes against synthetic or staging data before production use. Data cleanup and storage migration require a backup and a reviewed reconciliation plan.

## Phase 1 - Critical bugs and security

Observed findings include identifier-only login, API handlers without server-side session/access checks, client-persisted permissions, permissive marks parsing, and a marks write path that continues after failing to read existing records. The database endpoint returns the entire loaded dataset, and the page requests it before authentication. Analytics also accumulate duplicate rows while overwriting subject display values.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 1.1 | Replace email/staff-ID-only login with verified identity and server-managed sessions. Implement expiry, logout, and session validation; stop treating browser-persisted permissions as authentication. | P0 | `app/api/auth/route.js`, `lib/store.js`, `components/Auth/LoginScreen.jsx`, `lib/auth.js` (new) | Large | Identity-provider decision and configuration | High |
| 1.2 | Enforce server-side access checks on every API. Scope reads and writes by role, class, section, and subject; protect paper review; derive submitter identity from the session. Replace substring-based administrator detection with explicit role mappings. Load protected data only after session validation and constrain admin preview behavior on the server. | P0 | `app/api/*/route.js`, `lib/rbac.js`, `app/page.js`, `lib/store.js`, `components/Layout/Navbar.jsx` | Large | 1.1; agreed role/scope matrix | High |
| 1.3 | Validate complete marks requests before writing: finite numbers, permitted ranges, valid student/exam/subject relationships, duplicate entries, and submission-ID ownership. Reject malformed input instead of converting it to Absent or accepting numeric prefixes. | P0 | `app/api/marks/route.js`, `lib/googleSheets.js`, `lib/validation.js` (new) | Medium | 1.2; authoritative exam maximums | High |
| 1.4 | Stop writes when existing rows cannot be read. Prevent spreadsheet formula interpretation in identifiers and review feedback. Validate paper URLs, submission types, permitted status transitions, and payload sizes. | P0 | `lib/googleSheets.js`, `app/api/marks/route.js`, `app/api/question-papers/route.js` | Medium | 1.3; agreed paper-review transitions | High |
| 1.5 | Correct analytics inconsistencies: duplicate rows inflate totals, All Exams overwrites subject display values, and absent scores omit maximum marks from totals. Define absence, missing-score, duplicate-resolution, and multi-exam policies before changing calculations; remove ambiguous maximum-mark fallbacks. | P1 | `lib/analytics.js`, `lib/models.js`, `lib/grading.js`, `components/Reports/CadetResultCards.jsx`, `components/Analytics/AnalyticsDashboard.jsx` | Large | Agreed grading and aggregation rules; 1.3 | High |
| 1.6 | Add login/write rate limits, request-forgery protection appropriate to the selected session mechanism, and safe public error messages. Keep diagnostic details in server logs with request IDs. | P1 | `app/api/*/route.js`, `lib/auth.js` (new), `lib/apiErrors.js` (new), `next.config.mjs` | Medium | 1.1-1.2 | Medium |

**Exit criteria:** unauthenticated and unauthorized requests cannot read protected data or mutate records; invalid marks and failed prerequisite reads produce no writes; result calculations follow documented rules and have regression coverage.

## Phase 2 - Code quality and architecture

The repository contains large portal components and storage logic coupled to normalization and write behavior. Refactoring should preserve the security fixes from Phase 1.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 2.1 | **Completed 2026-09-15:** Next.js was designated the single supported runtime and the obsolete Python/Streamlit implementation was removed. | P1 | `README.md`, `AGENTS.md` | Small | Product/maintenance ownership decision | Low |
| 2.2 | Separate API handlers, business services, and Sheets access. Keep authorization and validation explicit at server boundaries and prevent server-only credential/storage code from entering client bundles. | P1 | `app/api/*/route.js`, `lib/googleSheets.js`, `lib/services/` (new), `lib/repositories/` (new) | Large | Phase 1; 2.1 | Medium |
| 2.3 | Centralize identifiers, absence normalization, exam resolution, grading rules, and data contracts. Introduce types incrementally at these boundaries. | P1 | `lib/models.js`, `lib/grading.js`, `lib/analytics.js`, `lib/rbac.js`, `lib/schemas/` (new) | Large | 1.5; 2.2 | High |
| 2.4 | Split large portals into focused forms, tables, hooks, and export actions. Separate session state, server data, preferences, and drafts. Establish linting and formatting and remove verified unused code as part of the refactor. | P2 | `components/MarksEntry/MarksEntryPortal.jsx`, `components/Papers/QuestionPaperPortal.jsx`, `components/Reports/CadetResultCards.jsx`, `lib/store.js`, `package.json`, lint configuration (new) | Large | 2.2-2.3 | Medium |

**Exit criteria:** business rules have an authoritative implementation, module boundaries are documented, and storage changes do not require rewriting portal components.

## Phase 3 - Database and API improvements

Current risks include fixed column positions, the 1,000-row paper review lookup, read-then-write races, separate update/append operations, and process-local cache invalidation. Strong concurrency guarantees require durable coordination or transactional storage, not a process-local lock.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 3.1 | Validate required tabs, headers, unique keys, and references. Replace fixed column assumptions and the paper lookup row limit. Produce a duplicate/orphan report before cleanup, with a reviewed reconciliation procedure. | P1 | `lib/googleSheets.js`, `lib/schemas/` (new), `scripts/validate-data.*` (new), database documentation (new) | Medium | 2.2-2.3; representative sanitized fixtures | Medium |
| 3.2 | Make saves safe under retries and concurrent writers through idempotency, conflict detection, and explicit partial-failure handling. Choose durable write coordination or transactional storage; define how manual Sheet edits interact with that choice. If migrating, include schema, backfill, reconciliation, cutover, and rollback. | P1 | `lib/repositories/` (new), `lib/services/` (new), `app/api/marks/route.js`, `app/api/question-papers/route.js`, storage configuration/migrations (new, if needed) | Large | 3.1; storage decision; backup before migration | High |
| 3.3 | Replace the master-database response with scoped resource endpoints, filtering, and pagination. Return consistent validation errors and save receipts. Update consumers together and maintain authorization on each endpoint. | P1 | `app/api/database/route.js`, resource routes (new), `app/page.js`, `components/`, `lib/apiClient.js` (new) | Large | 1.2; 2.2-2.3 | Medium |
| 3.4 | Add durable change history with actor, timestamp, previous/new values, and request ID. Define backup, restore, retention, and reviewed correction procedures. Couple audit recording to write outcomes so successful changes cannot silently lose their history. | P1 | `lib/services/` (new), `lib/repositories/` (new), audit storage (new), backup scripts and runbook (new) | Large | 3.2 | High |
| 3.5 | Implement cache invalidation across deployed instances and prevent stale responses from replacing newly saved data. Distinguish upstream outages from legitimately empty datasets; use bounded retries only where safe and avoid blindly retrying non-idempotent writes. | P1 | `lib/googleSheets.js`, `lib/repositories/` (new), `lib/apiClient.js` (new), `app/page.js` | Medium | 3.2-3.3 | Medium |

**Exit criteria:** repeated or concurrent saves have predictable outcomes, records remain discoverable as data grows, and changes can be traced and recovered. A storage migration is conditional on the decision in 3.2, not an assumed requirement.

## Phase 4 - UI/UX improvements

Mobile navigation, cadet search, and local drafts already exist. The draft key currently identifies exam/class/section/subject but not the user, so account isolation and recovery behavior need attention. Accessibility and layout tasks below are verification-and-repair work, not claims that every listed area is currently broken.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 4.1 | Make draft recovery safe: include user identity and schema version in draft keys, define expiry/logout handling, detect stale drafts, and distinguish local drafts from confirmed saves. Make storage failures visible and avoid silently applying another user's or outdated draft. | P1 | `components/MarksEntry/MarksEntryPortal.jsx`, `lib/store.js`, draft hook (new) | Medium | 1.1; 3.2-3.3 | Medium |
| 4.2 | Improve marks-entry recovery with row-level errors, first-error focus, submission review, clear progress, and protection against accidental navigation or duplicate saves. Preserve efficient desktop bulk entry and import workflows. | P1 | `components/MarksEntry/MarksEntryPortal.jsx`, shared form components (new) | Medium | 1.3; 3.3; 4.1 | Medium |
| 4.3 | Make navigation role-aware, preserve valid filter selections, and provide consistent loading, empty, permission-denied, and retry states. Replace blocking export alerts with actionable feedback and keep technical backend details out of routine staff messages. | P2 | `app/page.js`, `components/Layout/`, `components/Analytics/AnalyticsDashboard.jsx`, `components/Reports/CadetResultCards.jsx`, `components/Papers/QuestionPaperPortal.jsx` | Medium | 1.2; 3.3 | Low |
| 4.4 | Verify and repair mobile layouts, keyboard operation, labels, focus, contrast, reduced motion, safe areas, and multilingual/RTL output. Standardize reusable styles and verify printable/export layouts independently of screen layouts. | P2 | `app/globals.css`, `app/layout.js`, `components/`, `lib/pdfGenerator.js`, `lib/paperDocumentGenerator.js` | Medium | 2.4; 4.2-4.3 | Medium |

**Exit criteria:** staff can enter, recover, save, review, and export work on phones and with a keyboard. Save status is unambiguous, drafts are isolated by user, and primary workflows remain usable at 375px and 430px widths.

## Phase 5 - Testing

The retired Python tests did not establish coverage for the JavaScript application. Start the JavaScript test harness during Phase 1 and add regression tests with each fix. This phase broadens coverage and makes it a release gate.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 5.1 | Establish JavaScript unit and API test tooling with synthetic fixtures. Cover grading boundaries, absence/missing distinctions, duplicate records, exam selection, and role mappings. | P1 | `package.json`, test configuration (new), `tests/` | Medium | Begin during Phase 1; extend after 2.3 | Low |
| 5.2 | Add adversarial API and storage integration tests: forged roles, unauthorized records, cross-record submission IDs, invalid payloads, formula inputs, failed reads, partial writes, retries, and concurrent saves. Exercise the selected durable storage/coordination mechanism in staging, beyond mocks alone. | P1 | `tests/api/` (new), `tests/integration/` (new), synthetic Sheets fixtures (new) | Large | 5.1; 1.1-1.4; 3.2-3.5 | Low |
| 5.3 | Add end-to-end tests for teacher/admin workflows, session expiry, draft isolation/recovery, import validation, paper review, and report downloads across mobile and desktop. Include failed network requests and logout/login on shared devices. | P1 | `tests/e2e/` (new), browser-test configuration (new) | Large | 5.1; Phase 4 | Low |
| 5.4 | Add accessibility and export checks, including RTL text, page breaks, totals, and long documents. Gate changes on lint, automated tests, and production build in CI; retain manual visual review for multilingual exports. | P1 | `tests/e2e/` (new), `tests/exports/` (new), `package.json`, `.github/workflows/ci.yml` (new) | Medium | 5.1-5.3 | Low |

**Exit criteria:** CI detects access-control regressions, incorrect results, unsafe saves, and broken core workflows before release. Tests use synthetic/staging records rather than modifying production examination data.

## Phase 6 - Performance and deployment

The page statically imports the major portals, several portals import spreadsheet/export libraries, and the manifest references icons not present in the reviewed public file inventory. Performance changes should follow measured bottlenecks. Dependency review is a planned verification task; this roadmap does not assert specific package vulnerabilities.

| Recommended implementation order | Task | Priority | Files affected | Estimated complexity | Dependencies | Risk level |
|---|---|---|---|---|---|---|
| 6.1 | Measure bundle size, API latency, Sheets usage, and export time using representative data. Lazy-load inactive portals and document/spreadsheet generators; optimize repeated analytics scans and large lists where measurements justify it. Set performance budgets from the baseline. | P2 | `app/page.js`, `components/`, `lib/analytics.js`, `lib/pdfGenerator.js`, `lib/paperDocumentGenerator.js`, performance scripts/configuration (new) | Medium | 3.3-3.5; Phase 5 | Medium |
| 6.2 | Establish reproducible deployments: validate environment configuration, use locked dependency installs, review current dependency advisories, separate staging/production data, and document rollback. Review service-account privileges and secret handling without exposing credentials in logs. | P1 | `package.json`, `package-lock.json`, `vercel.json`, `next.config.mjs`, `.env.example`, deployment workflow and runbook (new) | Medium | 5.4; target deployment configuration | Medium |
| 6.3 | Add operational monitoring for failed saves, latency, quota errors, and stale data. Configure actionable alerts without recording private examination content. Rehearse restore and rollback against non-production data. | P1 | `lib/services/` (new), `lib/repositories/` (new), logging utilities (new), operational runbook (new), deployment settings | Medium | 3.4; 6.2 | Low |
| 6.4 | Repair manifest icon references. If installation/offline support remains a product goal, add an offline shell with explicit cache rules excluding private API responses and exam content; verify cache cleanup and update behavior. | P2 | `public/manifest.json`, `public/icon-192.png` (new), `public/icon-512.png` (new), `app/layout.js`, service worker (new, conditional) | Medium | 1.1-1.2; 4.1; 5.3; offline-support decision | Medium |

**Exit criteria:** production builds and deployments are reproducible, operational failures are observable, restore/rollback procedures are exercised, and measured performance meets the agreed budgets.

## Recommended delivery sequence and decision gates

1. Start 5.1 alongside Phase 1 and add focused tests with each security/data-integrity fix. Complete Phase 1 before broader rollout.
2. With runtime ownership resolved in 2.1, establish service and domain boundaries in Phase 2.
3. Validate the actual data layout in 3.1. Select the concurrency/storage strategy in 3.2 before implementing durable audit and cache behavior. Back up and reconcile data before any migration or cleanup.
4. Deliver Phase 4 against the secured, scoped APIs; preserve existing working mobile and bulk-entry features.
5. Complete the broader Phase 5 suite and CI gates before production release. Testing is continuous throughout all phases.
6. Measure and optimize performance, then complete deployment and operational readiness. Implement a service worker only if offline installation remains in scope.

Any dependency issue confirmed to be critical during review moves immediately into Phase 1.

Implementation estimates should be revisited after the identity-provider, grading-policy, and storage decisions. This roadmap does not claim that production access, dependency advisories, runtime behavior, or a full browser accessibility audit have been verified during its preparation.

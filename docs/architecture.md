# Current application architecture

Task 2.2 service/repository separation, verified locally on 2026-10-06.

## Runtime and ownership

Next.js 14 with React 18 and the App Router is the sole supported application runtime. `package.json`, `next.config.mjs`, and `vercel.json` define the current runtime. There is no supported Streamlit entry point. Question Paper Submission and Academic Review have been removed; Word exports are unsupported. Historical migration documentation remains historical.

| Layer | Current modules and responsibility |
|---|---|
| Application shell | `app/layout.js`, `app/page.js`: layout, session bootstrap, academic-data fetching, preview, and portal selection |
| Feature UI | `components/MarksEntry/MarksEntryPortal.jsx`, `components/Analytics/AnalyticsDashboard.jsx`, `components/Reports/CadetResultCards.jsx`: entry/import/drafts, analytics, result cards, and export/publication actions |
| Identity | `auth.js`, `app/api/auth/[...nextauth]/route.js`: Auth.js Google OAuth and JWT sessions |
| Staff approval | `lib/staffAuth.js`, `lib/staffApproval.mjs`: fresh staff lookup and approved identity resolution |
| Authorization | `lib/authorization.mjs`, re-exported by `lib/rbac.js`: role capabilities, class/subject scopes, database projection, and marks target ownership |
| HTTP boundary | `app/api/staff-session/route.js`, `app/api/database/route.js`, `app/api/marks/route.js`, `app/api/result-publications/route.js`: session, reads, marks writes, and publication workflows |
| HTTP security | `lib/requestForgery.mjs`, `lib/requestBody.mjs`, `lib/rateLimit.mjs`, `lib/requestContext.mjs`, `lib/apiErrors.mjs`: origin checks, bounded parsing, rate limits, request IDs/logging, and safe responses |
| Services | `lib/services/academicDataService.mjs`, `marksService.mjs`, `resultPublicationService.mjs`: academic projection/preview, authorized marks validation/save, and publication workflows |
| Persistence | `lib/repositories/`: service-account clients/discovery, academic reads/cache, marks atomic batch writes, publication safeguards/appends, and row parsing; `lib/googleSheets.js` remains a compatibility facade |
| Academic rules | `lib/examinationResults.mjs`, `lib/grading.js`, `lib/academicRules.mjs`: authoritative results, grading, and subject applicability; `lib/marksValidation.mjs` validates submissions |
| Presentation | `lib/analytics.js`, `lib/resultPresentation.mjs`: analytics and shared result models; `lib/models.js` supplies model helpers |
| Documents | `lib/pdfGenerator.js`, `lib/excelResultGenerator.mjs`: PDF and Excel result generation; `lib/cadetPhotos.js` and `lib/logo.js` supply visual assets |
| Browser state | `lib/store.js`: transient staff/permissions/preview and persisted theme; feature components own filters, drafts, and action progress |

Routes retain HTTP/security controls and fresh session/approval lookup, then invoke services with the server-resolved staff context. Services coordinate business workflows through repositories. Services also reject absent or disallowed staff contexts defensively; browser-supplied staff or permissions must never be passed as that context.

```text
API route -> service -> repository -> Google Sheets
```

Service factories accept repository dependencies for synthetic executable tests. Production uses the existing implementations by default. ServiceError carries expected status/code/details to the route; the route owns logging and HTTP response mapping. Unexpected storage failures retain safe public responses. Auth.js and staff-session routing remain separate.

## Data flow and integration

```text
Browser -> Auth.js Google sign-in -> fresh Staff_Directory approval -> session
Browser -> protected API -> fresh staff/assignment authorization -> Sheets reads
        -> server-projected academic data -> feature portals
        -> examinationResults -> analytics/resultPresentation -> UI/PDF/Excel
Marks submission -> origin/session/scope checks -> validation -> Sheets batch
Publication action -> authorized calculation/transition checks -> event append
```

`lib/repositories/googleSheetsClient.js` authenticates server-side with a Google service account. It uses `GOOGLE_SHEET_ID` when provided, otherwise discovers the workbook by `GOOGLE_SHEET_TITLE` through Drive. Sheets and Drive clients remain server responsibilities; credentials must never enter browser state or exports.

The master read targets `Students`, `Staff_Directory`, `Teaching_Assignments`, `Grading_System`, `exam_scheme`, `Marks_Log`, `Group_Subjects`, `Subjects_Master`, and `Result_Publications`. Headers become application row keys with compatibility aliases; preserve external names such as `Kit_No` and `Exam_ID`. Missing optional tabs become empty arrays in the master read, which does not imply valid academic configuration.

The master-data cache lasts three minutes and is module-local memory, not a shared distributed cache. Staff-directory and authorization reads bypass it. The database route overlays fresh `Students` and `Marks_Log` plus current staff/assignment records before projection and returns a private, no-store response. Permitted refreshes bypass the master cache. Successful marks/publication writes invalidate the local cache; other serverless instances may still have their own cache.

Marks writes reread stored rows, check headers, duplicates and submission-ID ownership, preserve existing IDs, and send updates/appends in one atomic Sheets batch. Atomicity of that batch does not provide distributed coordination between separate requests. Publication writes reread history and append explicit events with transition safeguards; they do not rewrite marks or infer publication from an export.

## Authentication and authorization

Google must provide a verified email. Approval requires exactly one matching `Staff_Directory` row with `Active = TRUE`; email matching ignores case and surrounding spaces. Personal Google accounts are allowed. Auth.js uses an eight-hour JWT session. Protected APIs reread current staff and teaching assignments, so client permissions and an existing session do not override revoked approval.

| Role | Current scope |
|---|---|
| Principal, Vice Principal | Read all academic data; no global marks-write capability |
| Admin Exam, In Charge Examination | Read all academic data, write all marks, refresh, and record publication events |
| Class Teacher | Read assigned class/section and write its marks; teaching assignments can add scopes |
| Teacher, Section Head | Assignment-based access; the title alone grants no global scope |

Assigned teachers may read class/section marks for overall analytics; subject-teacher writes remain limited to assigned subjects. Unknown roles are denied. Database projection filters protected records before delivery. Administrator preview resolves an active staff context on the server for reads; mutation authorization uses the real authenticated staff.

Mutation routes check same origin, rate limits, fresh authorization, and bounded JSON. Marks scope checks precede detailed validation when target records can be constructed. `lib/writeValidation.mjs` supplies storage validation helpers. Upstash supports shared production rate limiting; missing production configuration fails closed. Temporary limiter service failures fail open while normal authentication and authorization still apply.

`lib/staffAuth.js`, the storage facade, credential/storage repositories, and services import `server-only`, so Next.js rejects imports through client components. Pure row utilities contain no credentials or SDK access. Node tests initialize `tests/helpers/serverImports.mjs` before dynamically importing guarded modules; this test-only adapter resolves the compile-time marker and app aliases and allows explicit synthetic module mocks. It uses Node module registration hooks (available in Node 18.19+/20.6+, verified with Node 24.16.0); the application runtime and dependencies are unchanged. `auth.js` imports staff approval while `staffAuth.js` dynamically imports `auth.js` for session lookup. Preserve that runtime dependency when considering later extraction.

## Result calculation and exports

[`EXAMINATION_RULES.md`](EXAMINATION_RULES.md) remains the authoritative policy. This document describes implementation ownership rather than changing that policy.

`lib/examinationResults.mjs` resolves exact exam/grade/subject scheme matches, applicable subjects, attendance, duplicate conflicts, completeness, totals, grades, status, fingerprints, and ranks. Missing required marks remain missing; absence contributes zero obtained and the full maximum and forces failure. Conflicting duplicates and invalid/configuration states block finalization. Conduct contributes to totals. A required subject below 40 percent forces failure.

All Exams uses one grade and academic session and orders exams by valid, consistent, unique integer `Exam_Order`. It aggregates applicable exam/subject cells rather than choosing a latest exam. `lib/grading.js` uses the configured scale when present and the standard scale when absent; invalid or uncovered configured ranges return errors rather than silently falling back. Only complete, valid results are ranked, by percentage then obtained marks; exact ties share rank. Academic status and publication status are separate.

`lib/resultPresentation.mjs` owns shared individual and combined All Exams models consumed by UI and exports. PDF supports individual/batch result cards and merit sheets. ExcelJS loads dynamically for individual and combined result workbooks; SheetJS remains used for marks imports/templates. Exporting a document does not publish a result. Draft, Published, and Revised events are recorded explicitly in `Result_Publications`, with calculation fingerprints and revision history.

## Verification boundary

Existing Node tests cover security, authorization, marks validation/storage, results, and exports. A production build checks Next.js integration. Automated document-generation tests do not establish complete visual fidelity, and neither tests nor a build prove live Vercel/Sheets configuration. Use synthetic staging records for authenticated workflow verification.

# Session summary — 2026-09-14

## Implemented

- Completed Task 1.1 for the Next.js app: replaced email/Staff ID entry and faculty quick-select with Google Sign-In through Auth.js. Removed the old `/api/auth` identifier endpoint.
- Added server-side session checks to database, marks, and question-paper API routes. Paper review updates require the backend-derived admin permission; paper submissions derive the teacher name from the authenticated staff row.
- Added an `Active` column to the live `Staff_Directory` sheet and, as requested, set `TRUE` for all 31 existing staff rows. Nine of those rows had blank email cells and cannot match a Google account.

## Authentication now

- Auth.js accepts only a Google profile with `email_verified = true`. The server matches its email, after trimming and case normalization, to exactly one `Staff_Directory.Email` row with `Active = TRUE`. There is no email-domain restriction.
- Auth.js uses an eight-hour JWT session cookie. Each protected API request rereads the staff directory; roles and permissions are calculated from backend staff data and teaching assignments. Browser persistence retains only the theme preference.
- The Next.js page loads protected database data only after `/api/staff-session` succeeds. Sign-out uses Auth.js.

## Files changed

- Authentication and data access: `auth.js`, `lib/staffAuth.js`, `lib/staffApproval.mjs`, `lib/googleSheets.js`, `lib/store.js`, `app/api/auth/[...nextauth]/route.js`, `app/api/staff-session/route.js`, `app/api/database/route.js`, `app/api/marks/route.js`, `app/api/question-papers/route.js`; removed `app/api/auth/route.js`.
- UI: `app/page.js`, `components/Auth/LoginScreen.jsx`, `components/Layout/Navbar.jsx`.
- Dependency, configuration, and documentation: `package.json`, `package-lock.json`, `.env.example`, `docs/authentication-setup.md`, `tests/auth.test.mjs`, and this summary.
- These changes are in the working tree; no commit was made.

## Local configuration and validation

- `.env.local` contains `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`; it is Git-ignored. The local OAuth redirect is `http://localhost:3000/api/auth/callback/google`. Production OAuth configuration and deployment were not verified.
- `npm run build` passed after the `Active`-only rule. `node --test tests/auth.test.mjs` passed both approval-policy tests; `git diff --check` reported no whitespace errors.
- Local unauthenticated protected API requests returned 401. A real Google sign-in succeeded after the sheet update; the user confirmed access, and `/api/staff-session` and `/api/database` returned 200.

## Remaining work and warnings

- **Next task: Task 1.2**, enforce role, class, section, subject, and record-level authorization on each API. The database endpoint currently returns the full master dataset to any active staff user; the existing admin-role calculation also uses substring matching.
- The obsolete Streamlit/Python implementation was removed on 2026-09-15. Next.js is now the repository's single supported application.
- `npm audit --omit=dev` reported seven dependency advisories, including a critical Next.js advisory; dependency upgrades were not part of Task 1.1. Local dev logs also showed a non-blocking Watchpack scan warning and missing `/icon-192.png`.
- To revoke a staff member under the current implementation, set that row's `Active` value to `FALSE`; the next protected request rereads it. Do not restore the old identifier-only login or quick-select when rolling back other changes.

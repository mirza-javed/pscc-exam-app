# Deployment and rollback

Task 2.1 baseline, verified against repository configuration on 2026-10-06. The supported target is Next.js on Vercel. This document describes checked-in configuration; it does not certify the state of a live Vercel project or change any deployment settings.

## Existing commands

`vercel.json` selects `nextjs`, installs with `npm install`, builds with `next build`, and uses `next dev` for development. Local package scripts remain `npm run dev`, `npm run build`, and `npm start`; local locked dependency installation is `npm ci`. The Vercel install command differs from local guidance and is intentionally unchanged. `next.config.mjs` keeps `googleapis` external to server-component bundling.

## Environment configuration

Use `.env.example` as the name reference and `.env.local` for local credentials. Configure the corresponding Vercel deployment environments privately. Never paste credentials into documentation, logs, Git, or screenshots. No environment values are listed here.

| Names | Purpose |
|---|---|
| `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY` | Required Sheets/Drive service-account authentication; the private-key loader accepts escaped newlines |
| `GCP_PROJECT_ID` | Included in the example configuration; current Sheets client does not read it |
| `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TITLE` | Direct workbook ID or title-based Drive discovery; an ID takes precedence |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Auth.js session protection and Google Web application OAuth credentials |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_HASH_SECRET` | Required shared rate limiting and independently keyed identifier pseudonymization in production, including Vercel previews |
| `AUTH_TRUST_HOST` | Optional Auth.js setting for trusted self-hosted proxy deployments; Vercel is recognized automatically |

Optional rate-limit override names:

- `RATE_LIMIT_AUTH_SIGN_IN_MAX`, `RATE_LIMIT_AUTH_SIGN_IN_WINDOW_SECONDS`
- `RATE_LIMIT_AUTH_VERIFIED_EMAIL_MAX`, `RATE_LIMIT_AUTH_VERIFIED_EMAIL_WINDOW_SECONDS`
- `RATE_LIMIT_STAFF_SESSION_MAX`, `RATE_LIMIT_STAFF_SESSION_WINDOW_SECONDS`
- `RATE_LIMIT_DATABASE_READ_MAX`, `RATE_LIMIT_DATABASE_READ_WINDOW_SECONDS`
- `RATE_LIMIT_DATABASE_REFRESH_MAX`, `RATE_LIMIT_DATABASE_REFRESH_WINDOW_SECONDS`
- `RATE_LIMIT_MARKS_WRITE_MAX`, `RATE_LIMIT_MARKS_WRITE_WINDOW_SECONDS`
- `RATE_LIMIT_RESULT_PUBLICATION_MAX`, `RATE_LIMIT_RESULT_PUBLICATION_WINDOW_SECONDS`

The service account needs access to the configured workbook. Google OAuth is a separate user-identity integration, not service-account authentication. Register the actual deployment origin's `/api/auth/callback/google` redirect URI and follow [`authentication-setup.md`](authentication-setup.md). Use staging Sheets configuration for previews that will exercise writes. Do not expose these variables through public client environment names.

## Deployment verification

1. Record the candidate commit and current known-good deployment before release. Review the diff for unintended runtime/schema changes and secret exposure.
2. Run `node --test tests/*.test.mjs` and `npm run build` from the repository root. Confirm the Vercel build also succeeds with its existing configuration.
3. Verify required environment names are configured for the intended environment without printing their values. Check workbook access, OAuth callback registration, and shared rate-limit configuration privately.
4. On the candidate deployment, verify Google sign-in for approved staff, denial of unapproved staff, logout, and protected API behavior without a session.
5. With synthetic staging records, verify role scopes, preview/refresh permissions, marks validation/import/save, single-exam and All Exams analytics, individual/batch cards, PDF and Excel downloads, and explicit publication transitions. Check desktop and mobile views. Production examination records must not be used for test writes.
6. Inspect request-ID-based server logs for authentication, authorization, Sheets, or rate-limit failures without sharing sensitive data. Confirm the intended deployment serves the production domain after release.

These are operational checks to perform for a release; Task 2.1 itself does not deploy, alter environment settings, or run live Sheets operations. Record checks actually performed and any checks still pending.

## Rollback procedure

1. Identify the last verified Vercel deployment and its source commit. Preserve the failing deployment identifier and relevant sanitized diagnostics.
2. Use the project's Vercel deployment rollback/promotion controls to restore the known-good deployment to the production domain. If unavailable, redeploy the known-good source through the existing deployment process without changing dependencies or commands.
3. Check environment compatibility privately. Rolling back application code is not a substitute for restoring a changed environment configuration; any needed restoration must be separately reviewed by the deployment owner.
4. Repeat sign-in, scoped reads, and result/export smoke checks against the restored deployment. Exercise writes only against synthetic staging data. Confirm the production domain and logs indicate the intended version.
5. Record the rollback and pause further releases until the failure is understood.

A Vercel code rollback does not revert Google Sheets marks or publication events. Do not delete history or overwrite examination records as part of rollback. Any data correction requires a separate authorized procedure. Task 2.1 introduces no schema or data migration and therefore needs no data rollback.

## Local and production write readiness

Localhost uses the same real Upstash coordinator as production. There is no memory fallback for examination writes. Required settings are UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, WRITE_COORDINATION_SECRET and WRITE_COORDINATION_NAMESPACE, alongside Google Sheets service-account credentials. RATE_LIMIT_HASH_SECRET is separately required for production rate limiting; it does not replace the write secret. Audit cursor encryption uses the write secret; no additional audit environment variable is required.

Keep the write secret strong (at least 32 characters), stable and private. Every application instance writing the SAME workbook must use the SAME secret and namespace. Changing either changes lock keys and receipt identity; do not change them while any other writers or unresolved operations remain active. A local development namespace such as pscc-exam-dev is appropriate only for a distinct confirmed staging workbook. Different staging and production workbooks must use isolated namespaces, even when sharing an authorized Redis instance. Never point an isolated development coordinator at a production workbook that uses different coordination identity.

Use an explicit GOOGLE_SHEET_ID for writable staging/test environments; it is strongly recommended for all writable deployments. Do not test writes through title-based discovery or against an unknown workbook. Successful read APIs do not prove write coordination is ready. Connectivity alone also does not prove readiness: the workbook-specific ready-v1 sentinel, Write_Receipts, required operational sheets and Audit_Log schema must be verified separately. Do not create tabs or initialize Redis coordination over unresolved operations without the applicable approvals. The current localhost fix does not modify production configuration or any workbook.

Public failures remain safe WRITE_COORDINATION_UNAVAILABLE responses. Structured marks.coordination_unavailable or publication.coordination_unavailable events contain request ID, environment, provider, failureCategory and phase, never raw exceptions or credentials. Categories are CONFIG_MISSING, CONFIG_INVALID, PROVIDER_INITIALIZATION_FAILED, PROVIDER_UNAVAILABLE, NETWORK_FAILURE, READINESS_MISSING, LOCK_ACQUISITION_FAILED and STORAGE_CONTEXT_UNAVAILABLE. Lock contention retains WRITE_BUSY. Existing AUDIT_* errors remain distinct; Redis failures do not claim that an attempt audit was persisted. Configuration validation rejects non-HTTPS URLs, URL credentials/query/fragment, invalid namespace characters and short secrets. It cannot verify secret entropy or credential validity offline.

After configuration changes, restart the local Next.js server. Verify an authorized Redis connection with a read-only PING before any staging mutation. Confirm the target workbook is staging and verify receipt/audit readiness before one controlled synthetic save, persistence, receipt, audit event and identical retry. Academic changes, receipt and mandatory audit append remain in the same atomic Sheets batch; no audit bypass is available on localhost.

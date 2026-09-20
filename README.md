# Pakistan Steel Cadet College Examination Portal

The PSCC Examination Portal is a mobile-first Next.js application for marks entry, academic analytics, and cadet reports. Next.js is the repository's only supported application runtime. The former Question Paper Submission and Academic Review module has been removed and is no longer supported.

## Technology

- Next.js 14 with React 18 and the App Router
- Tailwind CSS and Recharts
- Google Sheets API for institutional data
- Auth.js with Google Sign-In
- Vercel deployment configuration
- Browser-side PDF, Word, and Excel export tooling

## Main features

- Role-aware marks entry with maximum-mark and absence handling
- Class, subject, and merit analytics
- Individual result cards and batch reports
- Urdu, Sindhi, and Arabic typography from `public/fonts/`

## Repository structure

```text
app/             Next.js pages and server API routes
components/      React feature and layout components
lib/             Sheets access, grading, analytics, RBAC, state, and generators
public/          Web manifest, institutional images, and web fonts
tests/           Node.js tests
docs/            Setup, architecture, plans, and project guidance
```

## Documentation

- [`docs/authentication-setup.md`](docs/authentication-setup.md) - Google Sign-In, Auth.js, staff approval, and environment setup.
- [`docs/EXAMINATION_RULES.md`](docs/EXAMINATION_RULES.md) - authoritative examination, grading, completeness, ranking, and publication rules.
- [`docs/exam_id_naming_conventions.md`](docs/exam_id_naming_conventions.md) - examination identifier conventions.
- [`docs/exam_scheme_template.csv`](docs/exam_scheme_template.csv), [`docs/result_publications_template.csv`](docs/result_publications_template.csv), and [`docs/exam_id_suggestions.csv`](docs/exam_id_suggestions.csv) - Google Sheets schema and planning templates.
- [`docs/improvements_recommended_by_codex.md`](docs/improvements_recommended_by_codex.md) - prioritized security, correctness, architecture, and testing roadmap.
- [`docs/codex-session-summary.md`](docs/codex-session-summary.md) - current implementation and validation handoff notes.
- [`docs/ui-ux-pro-max-recommendations.md`](docs/ui-ux-pro-max-recommendations.md) - historical migration and design rationale; Next.js is now the only supported runtime.

## Local development

Requirements:

- Node.js 18.17 or newer
- npm
- Google Cloud credentials for Sheets access and Google OAuth

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. See [`docs/authentication-setup.md`](docs/authentication-setup.md) and [`.env.example`](.env.example) for configuration.

## Validation

```bash
npm run build
node --test tests/*.test.mjs
```

## Deployment

The supported deployment target is Next.js on Vercel. Configure the variables documented in `.env.example`, including the Sheets service-account credentials and Auth.js Google OAuth credentials.

## Security

Never commit credentials or real student data. Authentication and authorization must be enforced by server code; client state is not a security boundary. Test data writes against a staging sheet.

## License

Developed for Pakistan Steel Cadet College Karachi. Internal institutional and academic use only.

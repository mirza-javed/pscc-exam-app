# Pakistan Steel Cadet College Examination Portal

The PSCC Examination Portal is a mobile-first Next.js application for marks entry, academic analytics, cadet reports, and question-paper submission and review. Next.js is the repository's only supported application runtime.

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
- Structured question-paper creation with PDF and Word downloads
- Academic review workflow for submitted papers
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
node --test tests/auth.test.mjs
```

## Deployment

The supported deployment target is Next.js on Vercel. Configure the variables documented in `.env.example`, including the Sheets service-account credentials and Auth.js Google OAuth credentials.

## Security

Never commit credentials or real student data. Authentication and authorization must be enforced by server code; client state is not a security boundary. Test data writes against a staging sheet.

## License

Developed for Pakistan Steel Cadet College Karachi. Internal institutional and academic use only.

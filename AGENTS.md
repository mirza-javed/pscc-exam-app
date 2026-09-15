# Repository Guidelines

## Project Structure & Module Organization

- `app/` contains the Next.js App Router UI and `app/api/*/route.js` endpoints.
- `components/` groups React portals by feature: marks entry, analytics, reports, papers, authentication, and layout.
- `lib/` contains Google Sheets access, RBAC, Zustand state, grading, analytics, and document generators.
- `public/` serves web assets, including document fonts and institutional images. `docs/` contains plans and project guidance.
- `tests/` contains Node.js tests. Next.js is the only supported application runtime.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm ci` installs locked JavaScript dependencies.
- `npm run dev` starts the Next.js development server.
- `npm run build` creates the production build; `npm start` serves it.
- `npm run lint` invokes Next.js linting. ESLint dependencies/configuration are not currently checked in, so setup may be required.
- `node --test tests/auth.test.mjs` runs the existing authentication tests.

## Coding Style & Naming Conventions

Match surrounding code: JavaScript/JSX uses two-space indentation, double quotes, and semicolons. Use PascalCase for React components and camelCase for JavaScript functions. Preserve external Sheet column names such as `Kit_No` and `Exam_ID`. Use the `@/` import alias where appropriate. No shared formatter configuration is currently present.

## Testing Guidelines

Use Node's test runner for current tests and keep test data synthetic. Cover grading boundaries, absence handling, permissions, and affected data/export behavior. There is no configured npm test script or enforced coverage percentage. For frontend changes, run the production build and manually verify affected desktop/mobile workflows and exports. Report checks actually performed.

## Commit & Pull Request Guidelines

History uses Conventional Commit-style subjects: `feat: ...`, `fix: ...`, and optional scopes such as `feat(analytics): ...`. Keep commits focused. PRs should explain the problem, resulting behavior, validation, and material risks; link relevant issues and include screenshots for UI changes. Document schema changes and migration/rollback steps.

## Security & Configuration

Keep credentials in local environment files; never commit secrets or real student data. Use `.env.example` as the configuration reference. Validate authorization and marks on the server; browser state is not a security boundary. Test writes against staging data, not production examination records.

# Repository Guidelines

## Project Structure & Module Organization

- `app/` contains the Next.js App Router UI and `app/api/*/route.js` endpoints.
- `components/` groups React portals by feature: marks entry, analytics, reports, papers, authentication, and layout.
- `lib/` contains Google Sheets access, RBAC, Zustand state, grading, analytics, and document generators.
- `app.py` and `src/` provide the parallel Python/Streamlit implementation; Python tests live in `tests/`.
- `public/` serves web assets; `static/` and `fonts/` support Python and document assets. `docs/` contains plans and project guidance.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm ci` installs locked JavaScript dependencies.
- `npm run dev` starts the Next.js development server.
- `npm run build` creates the production build; `npm start` serves it.
- `npm run lint` invokes Next.js linting. ESLint dependencies/configuration are not currently checked in, so setup may be required.
- `python -m pip install -r requirements.txt` installs Python dependencies; install `pytest` separately for tests.
- `python -m streamlit run app.py` runs the Python application.
- `python -m pytest tests/ -v` runs the Python suite.

## Coding Style & Naming Conventions

Match surrounding code: JavaScript/JSX uses two-space indentation, double quotes, and semicolons; Python uses four spaces. Use PascalCase for React components, camelCase for JavaScript functions, and snake_case for Python functions. Preserve external Sheet column names such as `Kit_No` and `Exam_ID`. Use the `@/` import alias where appropriate. No shared formatter configuration is currently present.

## Testing Guidelines

Use pytest files named `test_*.py` and functions named `test_*`. Cover grading boundaries, absence handling, permissions, and affected data/export behavior with synthetic records. There is no configured JavaScript test script or enforced coverage percentage. For frontend changes, run the production build and manually verify affected desktop/mobile workflows and exports. Report checks actually performed.

## Commit & Pull Request Guidelines

History uses Conventional Commit-style subjects: `feat: ...`, `fix: ...`, and optional scopes such as `feat(analytics): ...`. Keep commits focused. PRs should explain the problem, resulting behavior, validation, and material risks; link relevant issues and include screenshots for UI changes. Document schema changes and migration/rollback steps.

## Security & Configuration

Keep credentials in local environment files or `.streamlit/secrets.toml`; never commit secrets or real student data. Use `.env.example` as the configuration reference. Validate authorization and marks on the server; browser state is not a security boundary. Test writes against staging data, not production examination records.

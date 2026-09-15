# PSCC Exam Portal documentation

The repository supports one application: the Next.js examination portal in `app/`, `components/`, and `lib/`.

## Current documentation

- [`authentication-setup.md`](authentication-setup.md) — Google Sign-In, Auth.js, staff approval, and environment setup.
- [`codex-session-summary.md`](codex-session-summary.md) — saved implementation and validation state from the latest development session.
- [`improvements_recommended_by_codex.md`](improvements_recommended_by_codex.md) — prioritized security, correctness, architecture, and testing roadmap.
- [`exam_id_naming_conventions.md`](exam_id_naming_conventions.md) — examination identifier conventions.
- [`exam_scheme_template.csv`](exam_scheme_template.csv) and [`exam_id_suggestions.csv`](exam_id_suggestions.csv) — data-planning templates.
- [`ui-ux-pro-max-recommendations.md`](ui-ux-pro-max-recommendations.md) — historical migration/design rationale for the current Next.js implementation.

Other documents and sample exports in this directory support the Next.js question-paper and reporting workflows.

## Developer entry points

- [`../README.md`](../README.md) — application overview and quick start.
- [`../AGENTS.md`](../AGENTS.md) — repository conventions and validation commands.
- [`../.env.example`](../.env.example) — required environment variables.

Documentation should describe Next.js as the single supported runtime. Historical migration material must be clearly labelled so it is not mistaken for current deployment guidance.

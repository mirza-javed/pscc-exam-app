import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Deliberately scoped: Task 2.4 does not reformat unrelated application modules.
const files = [
  ".eslintrc.json",
  ".prettierrc.json",
  "package.json",
  "app/page.js",
  "lib/store.js",
  "lib/preferencesStore.js",
  "lib/client/marksWorkbook.mjs",
  "hooks",
  "lib/models.js",
  "lib/googleSheets.js",
  "lib/repositories/marksRepository.js",
  "lib/pdfGenerator.js",
  "lib/writeValidation.mjs",
  "components/Analytics",
  "components/Reports",
  "components/MarksEntry",
  "components/Layout/Navbar.jsx",
  "components/Auth/LoginScreen.jsx",
  "scripts/format-task24.mjs",
  "tests/ui-characterization.test.mjs",
  "tests/domain-characterization.test.mjs",
  "tests/marks-workbook.test.mjs",
  "tests/ui-state.test.mjs",
  "tests/client-boundaries.test.mjs",
  "tests/helpers/uiHarness.mjs",
  "tests/helpers/marksEntry.mjs",
  "tests/helpers/reportsEntry.mjs",
  "tests/helpers/pageEntry.mjs",
  "docs/task-2.4-characterization.md",
  "docs/task-2.4-completion.md",
  "docs/architecture.md",
  "docs/improvements_recommended_by_codex.md",
];
const result = spawnSync(
  process.execPath,
  [
    require.resolve("prettier/bin/prettier.cjs"),
    process.argv.includes("--write") ? "--write" : "--check",
    ...files,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);

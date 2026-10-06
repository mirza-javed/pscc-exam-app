import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`],
    )
    .filter((file) => /\.(js|jsx|mjs)$/.test(file));
}

test("client import graphs remain outside server services, repositories and credentials", () => {
  const seen = new Set();
  function visit(file, chain) {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(
      !/(?:^|\/)(services|repositories|server)\/|googleSheets|staffAuth|^auth\.js$/.test(
        file,
      ),
      `Server module reached: ${[...chain, file].join(" -> ")}`,
    );
    const source = readFileSync(path.join(root, file), "utf8");
    const modules = [
      ...source.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]);
    for (const dependency of modules) {
      assert.ok(
        !["server-only", "googleapis"].includes(dependency),
        `Server dependency ${dependency} reached by ${file}`,
      );
      if (!dependency.startsWith(".") && !dependency.startsWith("@/")) continue;
      const base = dependency.startsWith("@/")
        ? dependency.slice(2)
        : path.posix.normalize(
            path.posix.join(path.posix.dirname(file), dependency),
          );
      const resolved = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`].find(
        (candidate) =>
          existsSync(path.join(root, candidate)) &&
          /\.(js|jsx|mjs)$/.test(candidate),
      );
      if (resolved) visit(resolved, [...chain, file]);
    }
  }
  for (const file of [
    "app/page.js",
    "lib/store.js",
    "lib/preferencesStore.js",
    ...files("components"),
    ...files("hooks"),
    ...files("lib/client"),
  ])
    visit(file, []);
  assert.ok(seen.has("lib/examinationResults.mjs"));
  assert.ok(seen.has("lib/resultPresentation.mjs"));
});

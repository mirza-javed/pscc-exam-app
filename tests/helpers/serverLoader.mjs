import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
let mocks = {};
export function initialize(data) { mocks = data.mocks; }
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    let url = new URL(`../../${specifier.slice(2)}`, import.meta.url);
    if (!existsSync(fileURLToPath(url))) url = new URL(`${url.href}.js`);
    specifier = url.href;
  }
  const resolved = await nextResolve(specifier, context);
  if (mocks[resolved.url]) {
    const source = mocks[resolved.url].map((key) =>
      `export const ${key} = globalThis.__serverImportMocks.get(${JSON.stringify(resolved.url)}).${key};`
    ).join("\n");
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return resolved;
}

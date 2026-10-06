// Test-only adapter; production imports retain Next's server-only enforcement.
import { register } from "node:module";
const mocks = new Map();
globalThis.__serverImportMocks = mocks;
function installHooks() {
  register("./serverLoader.mjs", {
    parentURL: import.meta.url,
    data: { mocks: Object.fromEntries([...mocks].map(([url, exports]) => [url, Object.keys(exports)])) },
  });
}
export function mockServerModule(path, exports) {
  mocks.set(new URL(`../../${path}`, import.meta.url).href, exports);
  installHooks();
}
installHooks();

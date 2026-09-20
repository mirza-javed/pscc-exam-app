import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const writeRoutes = [
  "app/api/marks/route.js",
  "app/api/result-publications/route.js",
];

test("every custom write API validates same origin before body parsing", async () => {
  for (const route of writeRoutes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /validateSameOrigin\(request\)/, route);
    assert.ok(source.indexOf("validateSameOrigin(request)") < source.indexOf("readJsonBody(request)"), route);
  }
});

test("Auth.js routes retain Auth.js handling and do not use the custom origin guard", async () => {
  const source = await readFile(new URL("../app/api/auth/[...nextauth]/route.js", import.meta.url), "utf8");
  assert.match(source, /runAuthHandler\(handlers\.GET, request, context\)/);
  assert.match(source, /runAuthHandler\(handlers\.POST, request, context\)/);
  assert.match(source, /status:\s*429/);
  assert.doesNotMatch(source, /validateSameOrigin/);
});

test("all API routes create or attach request IDs", async () => {
  const routes = [
    ...writeRoutes,
    "app/api/database/route.js",
    "app/api/staff-session/route.js",
    "app/api/auth/[...nextauth]/route.js",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /(createRequestContext|attachRequestId)/, route);
  }
});

test("custom routes do not serialize caught upstream error messages", async () => {
  const routes = [
    ...writeRoutes,
    "app/api/database/route.js",
    "app/api/staff-session/route.js",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /console\.error\([^\n]*error/, route);
    assert.match(source, /unexpectedApiError/, route);
  }
});

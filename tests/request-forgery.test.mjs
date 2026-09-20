import assert from "node:assert/strict";
import test from "node:test";
import { validateSameOrigin } from "../lib/requestForgery.mjs";

function request(url, headers = {}) {
  return new Request(url, { method: "POST", headers });
}

test("same-origin validation accepts localhost development", () => {
  assert.equal(validateSameOrigin(request("http://localhost:3000/api/marks", {
    origin: "http://localhost:3000",
  })).valid, true);
});

test("same-origin validation accepts the exact production Vercel domain", () => {
  assert.equal(validateSameOrigin(request("https://pscc-exam-app.vercel.app/api/marks", {
    origin: "https://pscc-exam-app.vercel.app",
  })).valid, true);
});

test("same-origin validation accepts the active Vercel preview domain without a hostname allowlist", () => {
  assert.equal(validateSameOrigin(request("https://pscc-exam-git-task-16-team.vercel.app/api/question-papers", {
    origin: "https://pscc-exam-git-task-16-team.vercel.app",
  })).valid, true);
});

test("same-origin validation rejects forged and cross-origin write requests", () => {
  assert.equal(validateSameOrigin(request("https://pscc-exam-app.vercel.app/api/marks", {
    origin: "https://attacker.example",
  })).valid, false);
  assert.equal(validateSameOrigin(request("https://pscc-exam-app.vercel.app/api/marks")).valid, false);
});

test("same-origin referer is an accepted fallback only when Origin is absent", () => {
  assert.equal(validateSameOrigin(request("https://preview.vercel.app/api/result-publications", {
    referer: "https://preview.vercel.app/results?grade=9",
  })).valid, true);
  assert.equal(validateSameOrigin(request("https://preview.vercel.app/api/result-publications", {
    referer: "https://attacker.example/form",
  })).valid, false);
});

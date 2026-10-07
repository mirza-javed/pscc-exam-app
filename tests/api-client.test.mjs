import assert from "node:assert/strict";
import test from "node:test";
import { readAcademicResource } from "../lib/client/apiClient.mjs";
test("client encodes approved queries and propagates cancellation without business logic", async () => {
  let call;
  const signal = new AbortController().signal;
  const payload = await readAcademicResource("students", { search: "Synthetic & A", limit: 10, grade: "" }, { signal, fetchImpl: async (...args) => {
    call = args; return { ok: true, status: 200, json: async () => ({ success: true, items: [], nextCursor: null, hasMore: false }) };
  } });
  assert.equal(call[0], "/api/students?search=Synthetic+%26+A&limit=10");
  assert.equal(call[1].signal, signal); assert.equal(call[1].cache, "no-store");
  assert.deepEqual(payload.items, []);
  await assert.rejects(readAcademicResource("students", { unsupported: "x" }), /Unsupported/);
});
test("client preserves safe errors, HTTP status and request IDs including invalid JSON", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ success: false, error: "Forbidden.", code: "FORBIDDEN", requestId: "reference-123" }) });
  await assert.rejects(readAcademicResource("marks", {}, { fetchImpl }), (e) => e.status === 403 && e.code === "FORBIDDEN" && e.requestId === "reference-123" && e.message.includes("reference-123"));
  await assert.rejects(readAcademicResource("config", {}, { fetchImpl: async () => ({ status: 502, headers: new Headers({ "X-Request-ID": "header-ref" }), json: async () => { throw new Error("HTML upstream"); } }) }), (e) => e.code === "INVALID_RESPONSE" && e.requestId === "header-ref" && !e.message.includes("HTML"));
});

test("client rejects null JSON and malformed success contracts with safe reference errors", async () => {
  for (const [resource, payload] of [["config", null], ["config", { success: true }], ["students", { success: true, items: [] }]]) {
    await assert.rejects(readAcademicResource(resource, {}, { fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers({ "X-Request-ID": "contract-ref" }), json: async () => payload }) }), e => e.code === "INVALID_RESPONSE" && e.requestId === "contract-ref");
  }
});

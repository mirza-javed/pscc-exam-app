import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody, RequestBodyError } from "../lib/requestBody.mjs";

function jsonRequest(body, headers = {}) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

test("bounded JSON reader accepts valid JSON", async () => {
  const value = await readJsonBody(jsonRequest('{"ok":true}'), 64);
  assert.deepEqual(value, { ok: true });
});

test("bounded JSON reader rejects declared and streamed oversized bodies", async () => {
  await assert.rejects(
    readJsonBody(jsonRequest("{}", { "Content-Length": "65" }), 64),
    (error) => error instanceof RequestBodyError && error.code === "PAYLOAD_TOO_LARGE"
  );
  await assert.rejects(
    readJsonBody(jsonRequest(JSON.stringify({ value: "x".repeat(100) })), 32),
    (error) => error instanceof RequestBodyError && error.status === 413
  );
});

test("bounded JSON reader rejects invalid JSON and media types", async () => {
  await assert.rejects(
    readJsonBody(jsonRequest("not-json"), 64),
    (error) => error.code === "INVALID_JSON" && error.status === 400
  );
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(
    readJsonBody(request, 64),
    (error) => error.code === "UNSUPPORTED_MEDIA_TYPE" && error.status === 415
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { apiError, unexpectedApiError } from "../lib/apiErrors.mjs";
import { createRequestId, serializeErrorForLog } from "../lib/requestContext.mjs";

test("safe API errors preserve status, code, and request ID", async () => {
  const response = apiError({
    requestId: "request-abcdef12",
    status: 400,
    error: "Request validation failed.",
    code: "VALIDATION_FAILED",
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-request-id"), "request-abcdef12");
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Request validation failed.",
    code: "VALIDATION_FAILED",
    requestId: "request-abcdef12",
  });
});

test("unauthenticated and unauthorized responses remain distinct", async () => {
  const unauthenticated = apiError({ requestId: "request-authn001", status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
  const unauthorized = apiError({ requestId: "request-authz001", status: 403, error: "You are not authorized.", code: "FORBIDDEN" });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthorized.status, 403);
  assert.equal((await unauthenticated.json()).code, "AUTHENTICATION_REQUIRED");
  assert.equal((await unauthorized.json()).code, "FORBIDDEN");
});

test("rate-limit errors return 429 with a safe retry response", async () => {
  const response = apiError({
    requestId: "request-rate0001",
    status: 429,
    error: "Too many marks submissions. Please wait before trying again.",
    code: "RATE_LIMITED",
    headers: { "Retry-After": "30" },
  });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal(body.code, "RATE_LIMITED");
  assert.equal(body.requestId, "request-rate0001");
});

test("unexpected server errors expose only the stable public message", async () => {
  const originalError = console.error;
  const lines = [];
  console.error = (line) => lines.push(line);
  try {
    const response = unexpectedApiError({
      context: { requestId: "request-server01", route: "/api/marks", method: "POST" },
      event: "marks_write_failed",
      error: new Error("GCP_PRIVATE_KEY=secret-value at D:\\private\\server.js"),
      publicMessage: "Unable to save marks.",
      code: "MARKS_SAVE_FAILED",
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, "Unable to save marks.");
    assert.equal(body.requestId, "request-server01");
    assert.equal(JSON.stringify(body).includes("secret-value"), false);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes("secret-value"), false);
  } finally {
    console.error = originalError;
  }
});

test("request IDs propagate only when safely formatted", () => {
  const valid = new Request("https://example.test/api", { headers: { "x-request-id": "edge-request-1234" } });
  const invalid = { headers: { get: () => "bad id value" } };
  assert.equal(createRequestId(valid), "edge-request-1234");
  assert.match(createRequestId(invalid), /^[0-9a-f-]{36}$/);
});

test("server log serialization redacts emails, bearer tokens, and private keys", () => {
  const error = new Error("teacher@example.test Bearer abc.def.ghi?token=private");
  const serialized = serializeErrorForLog(error);
  assert.equal(serialized.message.includes("teacher@example.test"), false);
  assert.equal(serialized.message.includes("abc.def.ghi"), false);
});

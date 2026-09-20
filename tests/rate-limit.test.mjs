import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRateLimit,
  createMemoryRateLimitAdapter,
  getRateLimitPolicy,
  pseudonymizeRateLimitIdentifier,
  rateLimitHeaders,
} from "../lib/rateLimit.mjs";

const context = { requestId: "request-12345678", route: "/api/test", method: "POST" };
const testEnv = { NODE_ENV: "test", RATE_LIMIT_HASH_SECRET: "test-only-rate-limit-secret" };

test("requests below a configured limit are allowed and the next request is rejected", async () => {
  let now = 1_000_000;
  const adapter = createMemoryRateLimitAdapter({ now: () => now });
  const env = {
    ...testEnv,
    RATE_LIMIT_MARKS_WRITE_MAX: "2",
    RATE_LIMIT_MARKS_WRITE_WINDOW_SECONDS: "60",
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  const first = await checkRateLimit({ policyName: "marksWrite", identifierKind: "email", identifierValue: "teacher@example.test", context, adapter, env });
  const second = await checkRateLimit({ policyName: "marksWrite", identifierKind: "email", identifierValue: "teacher@example.test", context, adapter, env });
  const third = await checkRateLimit({ policyName: "marksWrite", identifierKind: "email", identifierValue: "teacher@example.test", context, adapter, env });
  console.warn = originalWarn;
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(rateLimitHeaders(third)["RateLimit-Limit"], 2);
  now += 60_001;
  const afterWindow = await checkRateLimit({ policyName: "marksWrite", identifierKind: "email", identifierValue: "teacher@example.test", context, adapter, env });
  assert.equal(afterWindow.allowed, true);
});

test("rate-limit identifiers are stable pseudonyms and never contain raw email or IP values", () => {
  const secret = "independent-rate-limit-secret";
  const emailKey = pseudonymizeRateLimitIdentifier("email", "Teacher@Example.test", secret);
  const sameEmailKey = pseudonymizeRateLimitIdentifier("email", "teacher@example.test", secret);
  const ipKey = pseudonymizeRateLimitIdentifier("ip", "203.0.113.10", secret);
  assert.equal(emailKey, sameEmailKey);
  assert.notEqual(emailKey, ipKey);
  assert.equal(emailKey.includes("teacher@example.test"), false);
  assert.equal(ipKey.includes("203.0.113.10"), false);
});

test("production refuses to run without shared Upstash configuration and the dedicated hash secret", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await checkRateLimit({
      policyName: "databaseRead",
      identifierKind: "ip",
      identifierValue: "203.0.113.10",
      context,
      adapter: createMemoryRateLimitAdapter(),
      env: { NODE_ENV: "production" },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.configured, false);
  } finally {
    console.error = originalError;
  }
});

test("temporary limiter failures fail open without disabling normal authorization", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await checkRateLimit({
      policyName: "marksWrite",
      identifierKind: "email",
      identifierValue: "teacher@example.test",
      context,
      adapter: { limit: async () => { throw new Error("temporary network failure"); } },
      env: testEnv,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.failedOpen, true);
  } finally {
    console.error = originalError;
  }
});

test("initial production defaults and environment overrides stay centralized", () => {
  assert.deepEqual(getRateLimitPolicy("authSignIn", {}), {
    name: "authSignIn",
    limit: 60,
    windowSeconds: 600,
    message: "Too many sign-in attempts. Please try again later.",
  });
  assert.equal(getRateLimitPolicy("marksWrite", { RATE_LIMIT_MARKS_WRITE_MAX: "25" }).limit, 25);
  assert.equal(getRateLimitPolicy("databaseRefresh", {}).limit, 5);
});

import "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
const { createWriteAdapterProvider, coordinationFailureCategory } = await import("../lib/services/writeCoordinationAdapter.mjs");
const { writeFixture } = await import("./helpers/writeFixture.mjs");
const config = {
  UPSTASH_REDIS_REST_URL: "https://synthetic.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "synthetic-token",
  WRITE_COORDINATION_SECRET: "synthetic-strong-secret-for-tests-only-123456",
  WRITE_COORDINATION_NAMESPACE: "synthetic-dev",
};

for (const environment of ["development", "production"]) {
  test(`${environment}: missing config fails closed without memory fallback`, async () => {
    const f = writeFixture();
    const coordinate = f.coordinator({ adapter: undefined, env: { NODE_ENV: environment } });
    await assert.rejects(coordinate({ kind: "marks", current: f.current, body: f.marks(),
      execute: () => assert.fail("must not execute") }), { code: "WRITE_COORDINATION_UNAVAILABLE" });
    assert.equal(f.batches.length, 0);
    assert.ok(f.logs.some((entry) => entry.fields?.failureCategory === "CONFIG_MISSING" || entry.failureCategory === "CONFIG_MISSING"));
  });
  test(`${environment}: configured Redis adapter is operational`, async () => {
    const f = writeFixture();
    const redis = {
      get: async (key) => key.endsWith(":ready") ? "ready-v1" : null,
      set: async () => "OK",
      eval: async () => 1,
    };
    const getAdapter = createWriteAdapterProvider(() => redis);
    const coordinate = f.coordinator({ adapter: undefined, getAdapter, env: { ...config, NODE_ENV: environment } });
    const receipt = await f.marksService({ coordinateWrite: coordinate })(f.current, f.marks());
    assert.equal(receipt.success, true);
    assert.equal(f.batches.length, 1);
    assert.equal(receipt.auditIds.length, 1);
  });
}

test("invalid config and initialization failures are distinct and sanitized", () => {
  const provider = createWriteAdapterProvider(() => { throw new Error("credential-must-not-leak"); });
  assert.throws(() => provider({ ...config, WRITE_COORDINATION_SECRET: "short" }), { failureCategory: "CONFIG_INVALID" });
  assert.throws(() => provider(config), (error) => {
    assert.equal(error.failureCategory, "PROVIDER_INITIALIZATION_FAILED");
    assert.doesNotMatch(error.message, /credential-must-not-leak/);
    return true;
  });
});

test("network and provider errors remain distinct", () => {
  assert.equal(coordinationFailureCategory(Object.assign(new Error(), { code: "ECONNRESET" })), "NETWORK_FAILURE");
  assert.equal(coordinationFailureCategory(new Error("unauthorized")), "PROVIDER_UNAVAILABLE");
});

test("provider failure logs only safe metadata and does not dispatch an audit attempt", async () => {
  const f = writeFixture();
  f.adapter.acquire = async () => { throw Object.assign(new Error("secret-token"), { code: "ECONNRESET" }); };
  await assert.rejects(f.marksService()(f.current, f.marks(), { requestId: "diagnostic-request" }), { code: "WRITE_COORDINATION_UNAVAILABLE" });
  assert.equal(f.batches.length, 0);
  assert.match(JSON.stringify(f.logs), /NETWORK_FAILURE/);
  assert.doesNotMatch(JSON.stringify(f.logs), /secret-token|teacher@example/);
});

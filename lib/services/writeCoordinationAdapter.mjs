import "server-only";
import { Redis } from "@upstash/redis";

// All changes affecting lock ownership or unresolved dispatch are atomic in Redis.
const OWNED = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end ";
export function createRedisWriteAdapter(redis) {
  return {
    ready: async (prefix) =>
      (await redis.get(`${prefix}:ready`)) === "ready-v1",
    acquire: async (key, owner, ttl) =>
      (await redis.set(key, owner, { nx: true, px: ttl })) === "OK",
    renew: async (key, owner, ttl) =>
      Number(
        await redis.eval(
          `${OWNED}return redis.call('PEXPIRE', KEYS[1], ARGV[2])`,
          [key],
          [owner, ttl],
        ),
      ) === 1,
    release: async (key, owner) =>
      redis.eval(`${OWNED}return redis.call('DEL', KEYS[1])`, [key], [owner]),
    pending: async (key) => redis.get(key),
    dispatch: async (lock, pending, owner, record) =>
      Number(
        await redis.eval(
          `${OWNED}if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end redis.call('SET', KEYS[2], ARGV[2]); return 1`,
          [lock, pending],
          [owner, JSON.stringify(record)],
        ),
      ) === 1,
    clearPending: async (key, operationId) =>
      redis.eval(
        "local v = redis.call('GET', KEYS[1]); if not v then return 1 end if cjson.decode(v).operationId ~= ARGV[1] then return 0 end return redis.call('DEL', KEYS[1])",
        [key],
        [operationId],
      ),
  };
}

export class CoordinationError extends Error {
  constructor(failureCategory) {
    super(failureCategory === "CONFIG_MISSING"
      ? "Write coordination configuration is missing."
      : "Write coordination provider is unavailable.");
    this.failureCategory = failureCategory;
  }
}

export function coordinationFailureCategory(error) {
  if (error instanceof CoordinationError) return error.failureCategory;
  const code = error?.cause?.code || error?.code;
  if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"].includes(code) ||
      ["AbortError", "TimeoutError"].includes(error?.name) || error instanceof TypeError) {
    return "NETWORK_FAILURE";
  }
  return "PROVIDER_UNAVAILABLE";
}

export function createWriteAdapterProvider(createClient = (options) => new Redis(options)) {
  let adapter;
  let configured;
  return function getAdapter(env = process.env) {
    const names = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
      "WRITE_COORDINATION_SECRET", "WRITE_COORDINATION_NAMESPACE"];
    if (names.some((name) => !env[name]?.trim())) throw new CoordinationError("CONFIG_MISSING");
    let url;
    try { url = new URL(env.UPSTASH_REDIS_REST_URL); } catch {
      throw new CoordinationError("CONFIG_INVALID");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(env.WRITE_COORDINATION_NAMESPACE) ||
        env.WRITE_COORDINATION_SECRET.trim().length < 32) {
      throw new CoordinationError("CONFIG_INVALID");
    }
    const identity = names.map((name) => env[name]);
    if (!adapter || identity.some((value, index) => value !== configured[index])) {
      try {
        adapter = createRedisWriteAdapter(createClient({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
          retry: false,
          signal: () => AbortSignal.timeout(5000),
        }));
        configured = identity;
      } catch {
        throw new CoordinationError("PROVIDER_INITIALIZATION_FAILED");
      }
    }
    // Never fall back to process-local coordination in any environment.
    return adapter;
  };
}

export const getWriteAdapter = createWriteAdapterProvider();

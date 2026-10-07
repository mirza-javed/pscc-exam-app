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

let adapter;
export function getWriteAdapter(env = process.env) {
  if (
    !env.UPSTASH_REDIS_REST_URL ||
    !env.UPSTASH_REDIS_REST_TOKEN ||
    !env.WRITE_COORDINATION_SECRET ||
    !env.WRITE_COORDINATION_NAMESPACE
  ) {
    throw new Error("Write coordination configuration is missing.");
  }
  // No process-local production or development fallback.
  adapter ||= createRedisWriteAdapter(
    new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
      retry: false,
      signal: () => AbortSignal.timeout(5000),
    }),
  );
  return adapter;
}

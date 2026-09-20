import { createHmac, randomBytes } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logApiEvent } from "./requestContext.mjs";

const EPHEMERAL_LOCAL_SECRET = randomBytes(32).toString("hex");

const POLICY_DEFAULTS = {
  authSignIn: { env: "AUTH_SIGN_IN", limit: 60, windowSeconds: 600, message: "Too many sign-in attempts. Please try again later." },
  authVerifiedEmail: { env: "AUTH_VERIFIED_EMAIL", limit: 10, windowSeconds: 900, message: "Too many sign-in attempts. Please try again later." },
  staffSession: { env: "STAFF_SESSION", limit: 30, windowSeconds: 300, message: "Too many session requests. Please try again shortly." },
  databaseRead: { env: "DATABASE_READ", limit: 30, windowSeconds: 300, message: "Too many data requests. Please try again shortly." },
  databaseRefresh: { env: "DATABASE_REFRESH", limit: 5, windowSeconds: 300, message: "Too many refresh requests. Please wait before refreshing again." },
  marksWrite: { env: "MARKS_WRITE", limit: 10, windowSeconds: 300, message: "Too many marks submissions. Please wait before trying again." },
  paperSubmit: { env: "PAPER_SUBMIT", limit: 5, windowSeconds: 900, message: "Too many paper submissions. Please wait before trying again." },
  paperReview: { env: "PAPER_REVIEW", limit: 30, windowSeconds: 600, message: "Too many paper review requests. Please wait before trying again." },
  resultPublication: { env: "RESULT_PUBLICATION", limit: 60, windowSeconds: 600, message: "Too many result publication requests. Please wait before trying again." },
};

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRateLimitPolicy(name, env = process.env) {
  const defaults = POLICY_DEFAULTS[name];
  if (!defaults) throw new Error(`Unknown rate-limit policy: ${name}`);
  return {
    name,
    limit: positiveInteger(env[`RATE_LIMIT_${defaults.env}_MAX`], defaults.limit),
    windowSeconds: positiveInteger(
      env[`RATE_LIMIT_${defaults.env}_WINDOW_SECONDS`],
      defaults.windowSeconds
    ),
    message: defaults.message,
  };
}

export function getClientIp(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request?.headers?.get?.("x-real-ip")?.trim() || "unknown";
}

export function pseudonymizeRateLimitIdentifier(kind, value, secret) {
  const key = secret || process.env.RATE_LIMIT_HASH_SECRET || EPHEMERAL_LOCAL_SECRET;
  const normalized = String(value || "unknown").normalize("NFKC").trim().toLowerCase();
  const digest = createHmac("sha256", key).update(`${kind}\0${normalized}`).digest("hex");
  return `${kind}:${digest}`;
}

export function createMemoryRateLimitAdapter({ now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    async limit({ key, limit, windowSeconds }) {
      const current = now();
      const cutoff = current - windowSeconds * 1000;
      const recent = (buckets.get(key) || []).filter((timestamp) => timestamp > cutoff);
      const success = recent.length < limit;
      if (success) recent.push(current);
      buckets.set(key, recent);
      const reset = recent.length > 0 ? recent[0] + windowSeconds * 1000 : current;
      return { success, limit, remaining: Math.max(0, limit - recent.length), reset };
    },
    reset() {
      buckets.clear();
    },
  };
}

let injectedAdapter = null;
let localAdapter = null;
let sharedRedis = null;
const sharedLimiters = new Map();

export function setRateLimitAdapterForTests(adapter) {
  injectedAdapter = adapter;
}

function productionConfiguration(env) {
  const missing = [];
  if (!env.UPSTASH_REDIS_REST_URL) missing.push("UPSTASH_REDIS_REST_URL");
  if (!env.UPSTASH_REDIS_REST_TOKEN) missing.push("UPSTASH_REDIS_REST_TOKEN");
  if (!env.RATE_LIMIT_HASH_SECRET) missing.push("RATE_LIMIT_HASH_SECRET");
  return { valid: missing.length === 0, missing };
}

function getDefaultAdapter(policy, env) {
  if (env.NODE_ENV !== "production") {
    localAdapter ||= createMemoryRateLimitAdapter();
    return localAdapter;
  }
  sharedRedis ||= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  if (!sharedLimiters.has(policy.name)) {
    const limiter = new Ratelimit({
      redis: sharedRedis,
      limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
      prefix: `pscc:ratelimit:${policy.name}`,
    });
    sharedLimiters.set(policy.name, {
      limit: async ({ key }) => limiter.limit(key),
    });
  }
  return sharedLimiters.get(policy.name);
}

export async function checkRateLimit({
  policyName,
  identifierKind,
  identifierValue,
  context,
  adapter = injectedAdapter,
  env = process.env,
}) {
  const policy = getRateLimitPolicy(policyName, env);
  if (env.NODE_ENV === "production") {
    const configuration = productionConfiguration(env);
    if (!configuration.valid) {
      logApiEvent("error", "rate_limit_configuration_missing", context, {
        policy: policy.name,
        missingConfiguration: configuration.missing.join(","),
      });
      return { allowed: false, configured: false, policy };
    }
  }

  const key = pseudonymizeRateLimitIdentifier(
    identifierKind,
    identifierValue,
    env.RATE_LIMIT_HASH_SECRET
  );
  try {
    const result = await (adapter || getDefaultAdapter(policy, env)).limit({
      key: `${policy.name}:${key}`,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    });
    if (!result.success) {
      logApiEvent("warn", "rate_limit_exceeded", context, {
        policy: policy.name,
        actorRef: key,
        retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      });
    }
    return {
      allowed: result.success,
      configured: true,
      policy,
      actorRef: key,
      limit: result.limit ?? policy.limit,
      remaining: result.remaining ?? 0,
      reset: result.reset,
    };
  } catch (error) {
    logApiEvent("error", "rate_limit_service_unavailable_fail_open", context, {
      policy: policy.name,
      errorName: error?.name || "Error",
      errorCode: error?.code || undefined,
    });
    return { allowed: true, configured: true, failedOpen: true, policy, actorRef: key };
  }
}

export function rateLimitHeaders(result) {
  if (!result?.configured || result.failedOpen || !result.limit) return {};
  return {
    "RateLimit-Limit": result.limit,
    "RateLimit-Remaining": result.remaining,
    "RateLimit-Reset": result.reset ? Math.ceil(result.reset / 1000) : undefined,
  };
}

export function retryAfterSeconds(result) {
  return Math.max(1, Math.ceil(((result?.reset || Date.now() + 1000) - Date.now()) / 1000));
}

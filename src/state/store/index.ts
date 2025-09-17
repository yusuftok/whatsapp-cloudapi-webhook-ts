import IORedis from "ioredis";
import { Redis } from "@upstash/redis";
import { logger } from "../../config/logger";
import { SessionStoreAdapter } from "./SessionStore";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { RedisSessionStore } from "./RedisSessionStore";
import { CacheStore } from "../../utils/store/CacheStore";
import { InMemoryCacheStore } from "../../utils/store/InMemoryCacheStore";
import { RedisCacheStore } from "../../utils/store/RedisCacheStore";

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 3600);
const IDEMPOTENCY_TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 6 * 60 * 60);
const IN_MEMORY_LIMIT = Number(process.env.SESSION_IN_MEMORY_LIMIT ?? 50_000);

let redisClient: Redis | null = null;
let redisAvailable = false;

function initUpstashRedisClient(): Redis | null {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    logger.error("❌ Upstash REST API credentials not found - KV_REST_API_URL and KV_REST_API_TOKEN required");
    throw new Error("Upstash REST API credentials required - in-memory fallback disabled");
  }

  try {
    redisClient = new Redis({
      url: KV_REST_API_URL,
      token: KV_REST_API_TOKEN,
    });

    logger.info({
      url: KV_REST_API_URL.replace(/\/\/.*@/, '//***@'), // Mask credentials
      hasToken: !!KV_REST_API_TOKEN
    }, "✅ Upstash REST Redis client initialized");

    redisAvailable = true;
    return redisClient;
  } catch (error: any) {
    logger.error({ event: "UPSTASH_REDIS_INIT_FAILED", error: error.message }, "❌ Upstash Redis client initialization failed");
    throw error;
  }
}

const client = initUpstashRedisClient();

// Upstash REST Redis-only adapters - NO in-memory fallback
if (!client) {
  throw new Error("❌ Upstash Redis connection required - in-memory fallback disabled");
}

export const sessionAdapter: SessionStoreAdapter = new RedisSessionStore(client);
export const cacheAdapter: CacheStore = new RedisCacheStore(client);

export { SESSION_TTL_SECONDS, IDEMPOTENCY_TTL_SECONDS };

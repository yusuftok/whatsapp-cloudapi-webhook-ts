import IORedis from "ioredis";
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

let redisClient: IORedis | null = null;
let redisAvailable = false;

function initRedisClient(): IORedis | null {
  if (redisClient || redisAvailable) return redisClient;
  const { REDIS_URL } = process.env;
  if (!REDIS_URL) {
    logger.debug("Redis URL not provided; using in-memory session store");
    redisAvailable = false;
    return null;
  }

  try {
    // Parse Redis URL for explicit authentication
    const url = new URL(REDIS_URL);

    // Extract connection parameters
    const username = url.username || 'default';
    const password = url.password;
    const host = url.hostname;
    const port = parseInt(url.port || '6379');
    const useTLS = url.protocol === 'rediss:';

    logger.debug({
      host,
      port,
      username,
      useTLS,
      hasPassword: !!password,
      protocol: url.protocol
    }, "🔧 Redis connection parameters");

    redisClient = new IORedis({
      host,
      port,
      username,
      password,
      tls: useTLS ? {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined // Skip hostname verification
      } : undefined,
      connectTimeout: 10000, // 10 seconds
      lazyConnect: false, // Connect immediately
      maxRetriesPerRequest: 3,
      enableAutoPipelining: false,
      family: 4, // Force IPv4
    });

    redisClient.on("error", (error) => {
      redisAvailable = false;
      logger.error({ event: "REDIS_ERROR", error: error.message }, "❌ Redis connection error - CRITICAL: No fallback enabled");
    });

    redisClient.on("ready", () => {
      logger.info("✅ Redis connection established successfully");
      redisAvailable = true;
    });

    redisClient.on("end", () => {
      redisAvailable = false;
      logger.error("💥 Redis connection closed - CRITICAL: No fallback enabled");
    });

    redisClient.on("connect", () => {
      logger.info("🔗 Redis connecting...");
    });

    return redisClient;
  } catch (error: any) {
    logger.error({ event: "REDIS_INIT_FAILED", error: error.message }, "❌ Redis client initialization failed; using in-memory store");
    redisClient = null;
    redisAvailable = false;
    return null;
  }
}

const client = initRedisClient();

// Redis-only adapters - NO in-memory fallback
if (!client) {
  throw new Error("❌ Redis connection required - in-memory fallback disabled");
}

export const sessionAdapter: SessionStoreAdapter = new RedisSessionStore(client);
export const cacheAdapter: CacheStore = new RedisCacheStore(client);

export { SESSION_TTL_SECONDS, IDEMPOTENCY_TTL_SECONDS };

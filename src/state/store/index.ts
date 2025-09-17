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
    // Handle Upstash URL formats for ioredis compatibility
    let connectionUrl = REDIS_URL;

    // If URL contains 'default:' username, remove it for ioredis
    if (connectionUrl.includes('://default:')) {
      connectionUrl = connectionUrl.replace('://default:', '://:');
      logger.debug("Adjusted Redis URL format for ioredis compatibility");
    }

    // Ensure TLS is used for Upstash (rediss://)
    if (connectionUrl.startsWith('redis://')) {
      connectionUrl = connectionUrl.replace('redis://', 'rediss://');
      logger.debug("Enabled TLS for Redis connection");
    }

    redisClient = new IORedis(connectionUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      tls: {}, // Enable TLS for Upstash
    });

    redisClient.on("error", (error) => {
      logger.error({ event: "REDIS_ERROR", error: error.message }, "❌ Redis connection error");
    });

    redisClient.on("ready", () => {
      logger.info("✅ Redis connection established");
      redisAvailable = true;
    });

    redisClient.on("end", () => {
      redisAvailable = false;
      logger.warn("⚠️ Redis connection closed; falling back to in-memory store");
    });

    // Trigger lazy connection
    redisClient.connect().catch((err) => {
      logger.error({ event: "REDIS_CONNECT_FAILED", error: err.message }, "❌ Redis connection failed; using in-memory store");
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

export const sessionAdapter: SessionStoreAdapter = client
  ? new RedisSessionStore(client)
  : new InMemorySessionStore(IN_MEMORY_LIMIT, SESSION_TTL_SECONDS * 1000);

export const cacheAdapter: CacheStore = client
  ? new RedisCacheStore(client)
  : new InMemoryCacheStore();

export { SESSION_TTL_SECONDS, IDEMPOTENCY_TTL_SECONDS };

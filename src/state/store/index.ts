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

// Redis mode selection
type RedisMode = 'tcp' | 'rest';
const REDIS_MODE: RedisMode = (process.env.REDIS_MODE as RedisMode) || 'rest';

let redisClient: Redis | IORedis | null = null;
let redisAvailable = false;

function initRestRedisClient(): Redis | null {
  // Try both Vercel KV and standard Upstash variable names
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.KV_URL;
  // Use write token, NOT read-only token - try standard Upstash names first
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  logger.info({
    mode: 'REST',
    hasUPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    hasUPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    hasKV_REST_API_URL: !!process.env.KV_REST_API_URL,
    hasKV_URL: !!process.env.KV_URL,
    hasKV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
    selectedUrl: url?.substring(0, 30),
    selectedToken: token?.substring(0, 8),
    tokenLength: token?.length
  }, "🔍 REST Redis environment variables debug");

  if (!url || !token) {
    logger.error("❌ Upstash REST API credentials not found");
    throw new Error("Upstash REST API credentials required");
  }

  try {
    const client = new Redis({
      url,
      token,
    });

    logger.info({
      url: url.replace(/\/\/.*@/, '//***@'),
      hasToken: !!token,
      tokenLength: token.length
    }, "✅ Upstash REST Redis client initialized");

    // Test the connection immediately
    client.ping().then((result) => {
      logger.info({ pingResult: result }, "🏓 REST Redis PING test successful");
    }).catch((error) => {
      logger.error({ error: error.message, stack: error.stack }, "🚨 REST Redis PING test failed");
    });

    return client;
  } catch (error: any) {
    logger.error({ event: "REST_REDIS_INIT_FAILED", error: error.message }, "❌ REST Redis client initialization failed");
    throw error;
  }
}

function initTcpRedisClient(): IORedis | null {
  // TCP credentials
  const url = process.env.UPSTASH_REDIS_TCP_URL || process.env.REDIS_URL;
  const password = process.env.UPSTASH_REDIS_TCP_PASSWORD;

  logger.info({
    mode: 'TCP',
    hasUPSTASH_REDIS_TCP_URL: !!process.env.UPSTASH_REDIS_TCP_URL,
    hasUPSTASH_REDIS_TCP_PASSWORD: !!process.env.UPSTASH_REDIS_TCP_PASSWORD,
    hasREDIS_URL: !!process.env.REDIS_URL,
    selectedUrl: url?.substring(0, 30),
    hasPassword: !!password
  }, "🔍 TCP Redis environment variables debug");

  if (!url) {
    logger.error("❌ Upstash TCP credentials not found");
    throw new Error("Upstash TCP credentials required");
  }

  try {
    let client: IORedis;

    if (url.startsWith('redis://') || url.startsWith('rediss://')) {
      // Parse Redis URL
      client = new IORedis(url, {
        family: 4, // Use IPv4 for better compatibility
        enableAutoPipelining: false, // Disable to reduce connection issues
        maxRetriesPerRequest: null, // Allow unlimited retries with backoff
        lazyConnect: true, // Connect on first command
        connectTimeout: 15000,
        commandTimeout: 10000,
      });
    } else {
      // Manual host/port/password configuration
      const [host, port] = url.split(':');
      client = new IORedis({
        host,
        port: parseInt(port || '6379'),
        password,
        family: 4, // Use IPv4 for better compatibility
        enableAutoPipelining: false, // Disable to reduce connection issues
        maxRetriesPerRequest: null, // Allow unlimited retries with backoff
        lazyConnect: true, // Connect on first command
        connectTimeout: 15000,
        commandTimeout: 10000,
      });
    }

    logger.info({
      url: url.replace(/\/\/.*@/, '//***@'),
      hasPassword: !!password
    }, "✅ Upstash TCP Redis client initialized");

    // Test the connection immediately
    client.ping().then((result) => {
      logger.info({ pingResult: result }, "🏓 TCP Redis PING test successful");
    }).catch((error) => {
      logger.error({ error: error.message, stack: error.stack }, "🚨 TCP Redis PING test failed");
    });

    return client;
  } catch (error: any) {
    logger.error({ event: "TCP_REDIS_INIT_FAILED", error: error.message }, "❌ TCP Redis client initialization failed");
    throw error;
  }
}

function initRedisClient(): Redis | IORedis | null {
  logger.info({ redisMode: REDIS_MODE }, "🚀 Initializing Redis client");

  if (REDIS_MODE === 'tcp') {
    return initTcpRedisClient();
  } else {
    return initRestRedisClient();
  }
}

const client = initRedisClient();

// Redis adapters - NO in-memory fallback
if (!client) {
  throw new Error("❌ Redis connection required - in-memory fallback disabled");
}

redisAvailable = true;
redisClient = client;

export const sessionAdapter: SessionStoreAdapter = new RedisSessionStore(client);
export const cacheAdapter: CacheStore = new RedisCacheStore(client);

export { SESSION_TTL_SECONDS, IDEMPOTENCY_TTL_SECONDS };

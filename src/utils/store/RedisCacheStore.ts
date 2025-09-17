import IORedis from "ioredis";
import { Redis } from "@upstash/redis";
import { CacheStore } from "./CacheStore";

const CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || "seen:";

export class RedisCacheStore implements CacheStore {
  constructor(private client: IORedis | Redis) {}

  private key(id: string) {
    return `${CACHE_PREFIX}${id}`;
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.key(key))) === 1;
  }

  async set(key: string, ttlSeconds: number): Promise<void> {
    const redisKey = this.key(key);

    // Upstash REST client format
    if ('setex' in this.client) {
      await this.client.setex(redisKey, ttlSeconds, "1");
    } else {
      // IORedis format
      await (this.client as any).set(redisKey, "1", "EX", ttlSeconds);
    }
  }
}

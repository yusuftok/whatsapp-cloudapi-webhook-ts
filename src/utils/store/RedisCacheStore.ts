import IORedis from "ioredis";
import { CacheStore } from "./CacheStore";

const CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || "seen:";

export class RedisCacheStore implements CacheStore {
  constructor(private client: IORedis) {}

  private key(id: string) {
    return `${CACHE_PREFIX}${id}`;
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.key(key))) === 1;
  }

  async set(key: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.key(key), "1", "EX", ttlSeconds);
  }
}

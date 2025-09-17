import { cacheAdapter, IDEMPOTENCY_TTL_SECONDS } from "../state/store";
import { CacheStore } from "./store/CacheStore";

class IdempotencyCache {
  constructor(private readonly store: CacheStore, private readonly ttlSeconds: number) {}

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async set(key: string): Promise<void> {
    await this.store.set(key, this.ttlSeconds);
  }
}

export const seen = new IdempotencyCache(cacheAdapter, IDEMPOTENCY_TTL_SECONDS);

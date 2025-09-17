import { CacheStore } from "./CacheStore";

const DEFAULT_LIMIT = 5000;

export class InMemoryCacheStore implements CacheStore {
  private map = new Map<string, number>();

  constructor(private limit = DEFAULT_LIMIT) {}

  async has(key: string): Promise<boolean> {
    const expires = this.map.get(key);
    if (!expires) return false;
    if (Date.now() > expires) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  async set(key: string, ttlSeconds: number): Promise<void> {
    if (this.map.size >= this.limit && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey) this.map.delete(oldestKey);
    }
    this.map.set(key, Date.now() + ttlSeconds * 1000);
  }
}

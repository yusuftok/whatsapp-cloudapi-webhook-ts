import { SessionRecord, SessionStoreAdapter } from "./SessionStore";

const DEFAULT_LIMIT = 50_000;

export class InMemorySessionStore implements SessionStoreAdapter {
  private map = new Map<string, { record: SessionRecord; expiresAt: number }>();
  private limit: number;

  constructor(limit = DEFAULT_LIMIT, private ttlMs: number) {
    this.limit = limit;
  }

  async get(key: string): Promise<SessionRecord | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.record;
  }

  async set(key: string, record: SessionRecord, ttlSeconds: number): Promise<void> {
    if (this.map.size >= this.limit && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey) this.map.delete(oldestKey);
    }
    const ttl = ttlSeconds > 0 ? ttlSeconds * 1000 : this.ttlMs;
    this.map.set(key, { record, expiresAt: Date.now() + ttl });
  }

  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }

  async entries(): Promise<Array<[string, SessionRecord]>> {
    const now = Date.now();
    const result: Array<[string, SessionRecord]> = [];
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
        continue;
      }
      result.push([key, entry.record]);
    }
    return result;
  }

  async size(): Promise<number> {
    await this.entries();
    return this.map.size;
  }
}

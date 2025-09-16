export class TTLCache<V = unknown> {
  private readonly limit: number;
  private readonly defaultTtlMs: number;
  private readonly map: Map<string, { value: V; expires: number }>;

  constructor(limit = 50_000, ttlMs = 6 * 60 * 60 * 1000) {
    this.limit = limit;
    this.defaultTtlMs = ttlMs;
    this.map = new Map();
  }

  private pruneExpired(now = Date.now()): void {
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expires) {
        this.map.delete(key);
      }
    }
  }

  private ensureCapacity(incomingKey: string): void {
    if (this.map.has(incomingKey)) {
      return;
    }

    const now = Date.now();
    this.pruneExpired(now);

    if (this.map.size >= this.limit) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey) {
        this.map.delete(oldestKey);
      }
    }
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs): void {
    this.ensureCapacity(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    this.pruneExpired();
    return this.map.size;
  }

  keys(): string[] {
    this.pruneExpired();
    return Array.from(this.map.keys());
  }

  entries(): Array<[string, V]> {
    const now = Date.now();
    const result: Array<[string, V]> = [];

    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expires) {
        this.map.delete(key);
        continue;
      }
      result.push([key, entry.value]);
    }

    return result;
  }
}

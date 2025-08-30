export class TTLCache {
    private limit: number;
    private ttl: number;
    private map: Map<string, { expires: number }>;
  
    constructor(limit = 5000, ttlMs = 6 * 60 * 60 * 1000) {
      this.limit = limit;
      this.ttl = ttlMs;
      this.map = new Map();
    }
  
    has(key: string): boolean {
      const v = this.map.get(key);
      if (!v) return false;
      if (Date.now() > v.expires) {
        this.map.delete(key);
        return false;
      }
      return true;
    }
  
    set(key: string): void {
      if (this.map.size >= this.limit) {
        const oldestKey = this.map.keys().next().value;
        if (oldestKey) {
          this.map.delete(oldestKey);
        }
      }
      this.map.set(key, { expires: Date.now() + this.ttl });
    }
  }
  
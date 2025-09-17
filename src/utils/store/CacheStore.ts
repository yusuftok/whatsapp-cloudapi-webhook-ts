export interface CacheStore {
  has(key: string): Promise<boolean>;
  set(key: string, ttlSeconds: number): Promise<void>;
}

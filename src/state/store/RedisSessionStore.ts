import IORedis from "ioredis";
import { SessionRecord, SessionStoreAdapter } from "./SessionStore";

const SESSION_PREFIX = process.env.REDIS_SESSION_PREFIX || "sessions:";

export class RedisSessionStore implements SessionStoreAdapter {
  private client: IORedis;

  constructor(client: IORedis) {
    this.client = client;
  }

  private key(id: string) {
    return `${SESSION_PREFIX}${id}`;
  }

  async get(key: string): Promise<SessionRecord | null> {
    const raw = await this.client.get(this.key(key));
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async set(key: string, record: SessionRecord, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(record);
    if (ttlSeconds > 0) {
      await this.client.set(this.key(key), payload, "EX", ttlSeconds);
    } else {
      await this.client.set(this.key(key), payload);
    }
  }

  async delete(key: string): Promise<boolean> {
    return (await this.client.del(this.key(key))) > 0;
  }

  async entries(): Promise<Array<[string, SessionRecord]>> {
    const keys = await this.client.keys(`${SESSION_PREFIX}*`);
    if (keys.length === 0) return [];
    const values = await this.client.mget(keys);
    const result: Array<[string, SessionRecord]> = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const value = values[i];
      if (!value) continue;
      const sessionKey = key.replace(SESSION_PREFIX, "");
      result.push([sessionKey, JSON.parse(value)]);
    }
    return result;
  }

  async size(): Promise<number> {
    const keys = await this.client.keys(`${SESSION_PREFIX}*`);
    return keys.length;
  }
}

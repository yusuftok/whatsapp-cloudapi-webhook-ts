import IORedis from "ioredis";
import { Redis } from "@upstash/redis";
import { SessionRecord, SessionStoreAdapter } from "./SessionStore";

const SESSION_PREFIX = process.env.REDIS_SESSION_PREFIX || "sessions:";

export class RedisSessionStore implements SessionStoreAdapter {
  private client: IORedis | Redis;

  constructor(client: IORedis | Redis) {
    this.client = client;
  }

  private key(id: string) {
    return `${SESSION_PREFIX}${id}`;
  }

  async get(key: string): Promise<SessionRecord | null> {
    const raw = await this.client.get(this.key(key)) as string | null;
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async set(key: string, record: SessionRecord, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(record);
    const redisKey = this.key(key);

    if (ttlSeconds > 0) {
      // Upstash REST client format
      if ('setex' in this.client) {
        await this.client.setex(redisKey, ttlSeconds, payload);
      } else {
        // IORedis format
        await (this.client as any).set(redisKey, payload, "EX", ttlSeconds);
      }
    } else {
      await (this.client as any).set(redisKey, payload);
    }
  }

  async delete(key: string): Promise<boolean> {
    return (await this.client.del(this.key(key)) as number) > 0;
  }

  async entries(): Promise<Array<[string, SessionRecord]>> {
    const keys = await this.client.keys(`${SESSION_PREFIX}*`) as string[];
    if (keys.length === 0) return [];
    const values = await this.client.mget(keys) as (string | null)[];
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
    const keys = await this.client.keys(`${SESSION_PREFIX}*`) as string[];
    return keys.length;
  }
}

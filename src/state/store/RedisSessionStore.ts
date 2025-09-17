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

  /**
   * Helper function to handle different response formats between IORedis and Upstash REST
   */
  private parseRedisValue(raw: any): any {
    if (!raw) return null;

    // Enhanced debug logging
    console.log(`[DEBUG] parseRedisValue input:`, {
      type: typeof raw,
      value: raw,
      isString: typeof raw === 'string',
      isObject: typeof raw === 'object',
      toString: raw?.toString ? raw.toString() : 'no toString',
      constructor: raw?.constructor?.name,
      keys: typeof raw === 'object' ? Object.keys(raw) : 'not object',
      stringified: JSON.stringify(raw),
      length: raw?.length
    });

    // Handle different response formats
    let jsonString: string;
    if (typeof raw === 'string') {
      jsonString = raw;
    } else if (raw && typeof raw === 'object') {
      // Check if it's already a valid parsed object
      if (raw.toString && raw.toString() === '[object Object]') {
        // This is an actual object, not a string - maybe it's already the parsed data
        console.log(`[DEBUG] Object detected, checking if it's valid data:`, raw);

        // If it has expected session properties, return it directly
        if (raw.state || raw.phone || raw.createdAt) {
          console.log(`[DEBUG] Returning object as-is (appears to be valid session data)`);
          return raw;
        }

        throw new Error(`Invalid Redis response: [object Object] with keys: ${Object.keys(raw)}`);
      }
      // Try to stringify then parse to ensure consistency
      jsonString = JSON.stringify(raw);
    } else {
      throw new Error(`Unexpected Redis response type: ${typeof raw}, value: ${raw}`);
    }

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`Failed to parse Redis value as JSON: ${jsonString}, original type: ${typeof raw}, error: ${error}`);
    }
  }

  async get(key: string): Promise<SessionRecord | null> {
    const raw = await this.client.get(this.key(key)) as string | null;
    return this.parseRedisValue(raw);
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
      const parsedValue = this.parseRedisValue(value);
      if (parsedValue) {
        result.push([sessionKey, parsedValue]);
      }
    }
    return result;
  }

  async size(): Promise<number> {
    const keys = await this.client.keys(`${SESSION_PREFIX}*`) as string[];
    return keys.length;
  }
}

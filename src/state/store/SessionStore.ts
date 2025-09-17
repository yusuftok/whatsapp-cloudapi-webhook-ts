export interface SessionRecord {
  user: string;
  rawUser: string;
  workflowId: string;
  step: string;
  media: Array<{ type: "image" | "video"; id: string; caption?: string }>;
  location?: { lat?: number; lng?: number; name?: string; address?: string };
  descriptions: Array<{
    type: "text" | "audio";
    content: string;
    timestamp: number;
  }>;
  hasDescriptions: boolean;
  lastActivityAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStoreAdapter {
  get(key: string): Promise<SessionRecord | null>;
  set(key: string, record: SessionRecord, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<[string, SessionRecord]>>;
  size(): Promise<number>;
}

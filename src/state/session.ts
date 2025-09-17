import { normalizePhone } from "../utils/phone";
import { sessionAdapter, SESSION_TTL_SECONDS } from "./store";
import { SessionStoreAdapter, SessionRecord } from "./store/SessionStore";

export type Step = "idle" | "awaiting_location" | "awaiting_media" | "awaiting_description";

export interface Session {
  user: string;                // MSISDN (normalized)
  rawUser: string;             // Last seen raw phone format from WhatsApp
  workflowId: string;          // Unique workflow identifier
  step: Step;
  media: Array<{ type: "image" | "video"; id: string; caption?: string }>;
  location?: { lat?: number; lng?: number; name?: string; address?: string };
  descriptions: Array<{
    type: "text" | "audio";
    content: string;           // Text content or audio ID
    timestamp: number;
  }>;
  hasDescriptions: boolean;    // Track if at least one description received
  lastActivityAt: number;      // For 2-minute timeout tracking
  createdAt: number;
  updatedAt: number;
}

class SessionStore {
  constructor(
    private readonly adapter: SessionStoreAdapter,
    private readonly ttlSeconds = SESSION_TTL_SECONDS
  ) {}

  private createSession(normalizedPhone: string, rawPhone: string): Session {
    const now = Date.now();
    return {
      user: normalizedPhone,
      rawUser: rawPhone,
      workflowId: `wf_${now}_${normalizedPhone.slice(-4)}`,
      step: "awaiting_location",
      media: [],
      descriptions: [],
      hasDescriptions: false,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private toRecord(session: Session): SessionRecord {
    return {
      ...session,
      step: session.step,
    };
  }

  private fromRecord(record: SessionRecord): Session {
    return {
      ...record,
      step: record.step as Step,
    };
  }

  async get(phone: string): Promise<Session | undefined> {
    const normalizedPhone = normalizePhone(phone);
    const record = await this.adapter.get(normalizedPhone);
    if (!record) return undefined;
    record.rawUser = record.rawUser || normalizedPhone;
    return this.fromRecord(record);
  }

  async set(phone: string, session: Session, rawPhone?: string): Promise<void> {
    const normalizedPhone = normalizePhone(phone);
    const raw = rawPhone ?? session.rawUser ?? phone;
    const now = Date.now();
    const next: Session = {
      ...session,
      user: normalizedPhone,
      rawUser: raw,
      updatedAt: now,
      lastActivityAt: now,
    };
    await this.adapter.set(normalizedPhone, this.toRecord(next), this.ttlSeconds);
  }

  async update(phone: string, patch: Partial<Session>, rawPhone?: string): Promise<Session> {
    const normalizedPhone = normalizePhone(phone);
    const existing = await this.get(normalizedPhone);
    const base = existing ?? this.createSession(normalizedPhone, rawPhone ?? phone);
    const now = Date.now();
    const next: Session = {
      ...base,
      ...patch,
      user: normalizedPhone,
      rawUser: rawPhone ?? patch.rawUser ?? base.rawUser ?? normalizedPhone,
      updatedAt: now,
      lastActivityAt: now,
    };
    await this.adapter.set(normalizedPhone, this.toRecord(next), this.ttlSeconds);
    return next;
  }

  async new(phone: string, rawPhone?: string): Promise<Session> {
    const normalizedPhone = normalizePhone(phone);
    const raw = rawPhone ?? phone;
    const session = this.createSession(normalizedPhone, raw);
    await this.adapter.set(normalizedPhone, this.toRecord(session), this.ttlSeconds);
    return session;
  }

  async delete(phone: string): Promise<boolean> {
    const normalizedPhone = normalizePhone(phone);
    return this.adapter.delete(normalizedPhone);
  }

  async size(): Promise<number> {
    return this.adapter.size();
  }

  async keys(): Promise<string[]> {
    const entries = await this.adapter.entries();
    return entries.map(([key]) => key);
  }

  async entries(): Promise<Array<[string, Session]>> {
    const records = await this.adapter.entries();
    return records.map(([key, record]) => [key, this.fromRecord(record)]);
  }
}

export const sessions = new SessionStore(sessionAdapter);

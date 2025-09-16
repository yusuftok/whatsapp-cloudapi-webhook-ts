import { TTLCache } from "../utils/cache";
import { normalizePhone } from "../utils/phone";

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
  private readonly ttlMs = 60 * 60 * 1000; // 1 saat
  private readonly store: TTLCache<Session>;

  constructor(limit = 50_000) {
    this.store = new TTLCache<Session>(limit, this.ttlMs);
  }

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

  get(phone: string): Session | undefined {
    const normalizedPhone = normalizePhone(phone);
    const session = this.store.get(normalizedPhone);
    if (session) {
      // Ensure rawUser always has at least normalized fallback
      session.rawUser = session.rawUser || normalizedPhone;
    }
    return session;
  }

  set(phone: string, session: Session, rawPhone?: string): void {
    const normalizedPhone = normalizePhone(phone);
    const raw = rawPhone ?? session.rawUser ?? phone;
    const now = Date.now();
    session.updatedAt = now;
    session.lastActivityAt = now;
    session.user = normalizedPhone;
    session.rawUser = raw;
    this.store.set(normalizedPhone, session, this.ttlMs);
  }

  update(phone: string, patch: Partial<Session>, rawPhone?: string): Session {
    const normalizedPhone = normalizePhone(phone);
    const existing = this.get(normalizedPhone);
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
    this.store.set(normalizedPhone, next, this.ttlMs);
    return next;
  }

  new(phone: string, rawPhone?: string): Session {
    const normalizedPhone = normalizePhone(phone);
    const raw = rawPhone ?? phone;
    const session = this.createSession(normalizedPhone, raw);
    this.store.set(normalizedPhone, session, this.ttlMs);
    return session;
  }

  delete(phone: string): boolean {
    const normalizedPhone = normalizePhone(phone);
    return this.store.delete(normalizedPhone);
  }

  size(): number {
    return this.store.size();
  }

  keys(): string[] {
    return this.store.keys();
  }

  entries(): Array<[string, Session]> {
    return this.store.entries();
  }
}

export const sessions = new SessionStore();

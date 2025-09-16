import { TTLCache } from "../utils/cache";

export type Step =
  | "idle"
  | "awaiting_location"
  | "awaiting_description";

export interface Session {
  user: string;                // MSISDN (normalized)
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

/** ---- Phone normalization for consistent session keys ---- */
function normalizePhone(phone: string): string {
  // Remove all non-digits and normalize format
  // +905551234567 → 905551234567
  // 905551234567 → 905551234567  
  // 5551234567 → 5551234567
  return phone.replace(/^\+/, '').replace(/[^\d]/g, '');
}

class SessionStore {
  private readonly ttlMs = 60 * 60 * 1000; // 1 saat
  private readonly store: TTLCache<Session>;

  constructor(limit = 50_000) {
    this.store = new TTLCache<Session>(limit, this.ttlMs);
  }

  private createSession(normalizedPhone: string): Session {
    const now = Date.now();
    return {
      user: normalizedPhone,
      workflowId: `wf_${now}_${normalizedPhone.slice(-4)}`,
      step: "idle",
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
    return this.store.get(normalizedPhone);
  }

  set(phone: string, session: Session): void {
    const normalizedPhone = normalizePhone(phone);
    const now = Date.now();
    session.updatedAt = now;
    session.lastActivityAt = now;
    session.user = normalizedPhone;
    this.store.set(normalizedPhone, session, this.ttlMs);
  }

  update(phone: string, patch: Partial<Session>): Session {
    const normalizedPhone = normalizePhone(phone);
    const existing = this.get(normalizedPhone);
    const base = existing ?? this.createSession(normalizedPhone);
    const now = Date.now();
    const next: Session = {
      ...base,
      ...patch,
      user: normalizedPhone,
      updatedAt: now,
      lastActivityAt: now,
    };
    this.store.set(normalizedPhone, next, this.ttlMs);
    return next;
  }

  new(phone: string): Session {
    const normalizedPhone = normalizePhone(phone);
    const session = this.createSession(normalizedPhone);
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

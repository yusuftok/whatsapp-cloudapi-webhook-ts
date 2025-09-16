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
  private map = new Map<string, Session>();
  private ttlMs = 60 * 60 * 1000; // 1 saat

  get(phone: string): Session | undefined {
    const normalizedPhone = normalizePhone(phone);
    const s = this.map.get(normalizedPhone);
    if (!s) return;
    if (Date.now() - s.updatedAt > this.ttlMs) {
      this.map.delete(normalizedPhone);
      return;
    }
    return s;
  }

  set(phone: string, s: Session) {
    const normalizedPhone = normalizePhone(phone);
    s.updatedAt = Date.now();
    s.lastActivityAt = Date.now();
    s.user = normalizedPhone; // Ensure user field is also normalized
    this.map.set(normalizedPhone, s);
  }

  update(phone: string, patch: Partial<Session>) {
    const normalizedPhone = normalizePhone(phone);
    const cur = this.get(normalizedPhone);
    const next = { 
      ...(cur || this.new(normalizedPhone)), 
      ...patch, 
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      user: normalizedPhone // Ensure user field stays normalized
    };
    this.map.set(normalizedPhone, next);
    return next;
  }

  new(phone: string): Session {
    const normalizedPhone = normalizePhone(phone);
    const now = Date.now();
    const workflowId = `wf_${now}_${normalizedPhone.slice(-4)}`;
    const s: Session = {
      user: normalizedPhone,
      workflowId,
      step: "idle",
      media: [],
      descriptions: [],
      hasDescriptions: false,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.map.set(normalizedPhone, s);
    return s;
  }

  delete(phone: string) {
    const normalizedPhone = normalizePhone(phone);
    return this.map.delete(normalizedPhone);
  }

  size(): number {
    return this.map.size;
  }

  keys(): string[] {
    return Array.from(this.map.keys());
  }
}

export const sessions = new SessionStore();

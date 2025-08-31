export type Step =
  | "idle"
  | "awaiting_location"
  | "awaiting_description"
  | "completed";

export interface Session {
  user: string;                // MSISDN (from)
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
  private map = new Map<string, Session>();
  private ttlMs = 60 * 60 * 1000; // 1 saat

  get(phone: string): Session | undefined {
    const s = this.map.get(phone);
    if (!s) return;
    if (Date.now() - s.updatedAt > this.ttlMs) {
      this.map.delete(phone);
      return;
    }
    return s;
  }

  set(phone: string, s: Session) {
    s.updatedAt = Date.now();
    s.lastActivityAt = Date.now();
    this.map.set(phone, s);
  }

  update(phone: string, patch: Partial<Session>) {
    const cur = this.get(phone);
    const next = { 
      ...(cur || this.new(phone)), 
      ...patch, 
      updatedAt: Date.now(),
      lastActivityAt: Date.now()
    };
    this.map.set(phone, next);
    return next;
  }

  new(phone: string): Session {
    const now = Date.now();
    const workflowId = `wf_${now}_${phone.slice(-4)}`;
    const s: Session = {
      user: phone,
      workflowId,
      step: "idle",
      media: [],
      descriptions: [],
      hasDescriptions: false,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.map.set(phone, s);
    return s;
  }

  complete(phone: string) {
    const s = this.get(phone);
    if (!s) return;
    s.step = "completed";
    s.updatedAt = Date.now();
    this.map.set(phone, s);
    // Otomatik temizleme da eklenebilir
  }
}

export const sessions = new SessionStore();

export type PurposeId =
  | "shift_start"
  | "shift_end"
  | "new_task_start"
  | "task_finish"
  | "issue_report";

export type Step =
  | "idle"
  | "awaiting_location"
  | "awaiting_purpose"
  | "awaiting_task"
  | "awaiting_note_decision"
  | "awaiting_extra"
  | "completed";

export interface Session {
  user: string;                // MSISDN (from)
  step: Step;
  media: Array<{ kind: "image" | "video"; id: string; caption?: string }>;
  location?: { lat?: number; lng?: number; name?: string; address?: string };
  purpose?: PurposeId;
  selectedTaskId?: string;     // "independent" olabilir
  extraNote?: string;
  extraAudio?: { id: string; mime_type?: string };
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
    this.map.set(phone, s);
  }

  update(phone: string, patch: Partial<Session>) {
    const cur = this.get(phone);
    const next = { ...(cur || this.new(phone)), ...patch, updatedAt: Date.now() };
    this.map.set(phone, next);
    return next;
  }

  new(phone: string): Session {
    const now = Date.now();
    const s: Session = {
      user: phone,
      step: "idle",
      media: [],
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

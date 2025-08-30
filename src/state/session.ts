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
  
  // Reply tracking fields
  flowId: string;                                    // Unique flow identifier
  messageIds: Set<string>;                           // Bu flow'daki tüm mesaj ID'leri
  stateMessageMap: Map<string, Step>;                // MessageId -> State mapping
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
    
    // Message ID cleanup (max 50 mesaj sakla)
    if (s.messageIds.size > 50) {
      const idsArray = Array.from(s.messageIds);
      const toKeep = idsArray.slice(-30); // Son 30'u koru
      s.messageIds = new Set(toKeep);
      
      // StateMap'i de temizle
      const validIds = new Set(toKeep);
      for (const [id, _] of s.stateMessageMap) {
        if (!validIds.has(id)) {
          s.stateMessageMap.delete(id);
        }
      }
    }
    
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
      flowId: `flow_${now}_${phone}`,
      messageIds: new Set(),
      stateMessageMap: new Map(),
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

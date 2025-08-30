export type AnyObject = Record<string, unknown>;

export interface WhatsAppWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: "whatsapp";
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: AnyObject[];
        messages?: WhatsAppMessage[];
        statuses?: WhatsAppStatus[];
      };
    }>;
  }>;
}

export interface WhatsAppMessageBase {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  context?: {                    // Reply context
    from?: string;
    id?: string;                 // Reply yapılan mesajın ID'si
    forwarded?: boolean;
    frequently_forwarded?: boolean;
  };
}

export interface WhatsAppTextMessage extends WhatsAppMessageBase {
  type: "text";
  text?: { body?: string };
}

export interface WhatsAppMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
  voice?: boolean;
}

export interface WhatsAppMediaMessage extends WhatsAppMessageBase {
  type: "image" | "document" | "audio" | "video";
  image?: WhatsAppMedia;
  document?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
}

export interface WhatsAppLocationMessage extends WhatsAppMessageBase {
  type: "location";
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
}

export interface WhatsAppInteractiveMessage extends WhatsAppMessageBase {
  type: "interactive";
  interactive?: {
    type?: string; // "button" | "list" | "flow" | "cta_url" | ...
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    [k: string]: unknown;
  };
}

export type WhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppMediaMessage
  | WhatsAppLocationMessage
  | WhatsAppInteractiveMessage
  | WhatsAppMessageBase;

export interface WhatsAppStatus {
  id?: string;
  recipient_id?: string;
  status?: "sent" | "delivered" | "read" | "failed" | "deleted";
  timestamp?: string;
  conversation?: AnyObject;
  pricing?: AnyObject;
  errors?: AnyObject[];
}

/** Normalize edilmiş mesaj (inbound) */
export type NormalizedMessage =
  | {
      wa_message_id: string;
      from: string;
      timestamp: number;
      type: "text";
      text: string;
    }
  | {
      wa_message_id: string;
      from: string;
      timestamp: number;
      type: "image" | "document" | "audio" | "video";
      media: {
        kind: "image" | "document" | "audio" | "video";
        id?: string;
        mime_type?: string;
        sha256?: string;
        filename?: string;
        caption?: string;
        media_url?: string; // ephemeral
        download?: { base64: string; content_type: string; size: number };
      };
    }
  | {
      wa_message_id: string;
      from: string;
      timestamp: number;
      type: "location";
      location: {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
      };
    }
  | {
      wa_message_id: string;
      from: string;
      timestamp: number;
      type: "interactive";
      interactive: AnyObject;
    }
  | {
      wa_message_id: string;
      from: string;
      timestamp: number;
      type: string;
      raw: AnyObject;
    };

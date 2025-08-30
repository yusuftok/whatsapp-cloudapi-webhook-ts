import express, { Request, Response } from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import axios, { AxiosInstance } from "axios";
import { logger } from "./config/logger";
import { TTLCache } from "./utils/cache";
import {
  AnyObject,
  NormalizedMessage,
  WhatsAppMessage,
  WhatsAppWebhookBody,
  WhatsAppStatus,
} from "./types/whatsapp";
import { sessions, Session, PurposeId } from "./state/session";

dotenv.config();

/** ---- Env ---- */
const {
  PORT = "3000",
  VERIFY_TOKEN,
  APP_SECRET,
  GRAPH_API_VERSION = "v21.0",
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  FORWARD_URL,
  FORWARD_AUTH_HEADER,
  FORWARD_MEDIA_AS_BASE64 = "false", // prod'da genelde false
  MEDIA_MAX_BYTES = "10485760",

  WHATSAPP_ENABLE_LOCATION_REQUEST = "false", // true ise (varsa) native konum isteği dener
} = process.env;

/** ---- Logger imported from config/logger.ts ---- */

logger.info({ 
  NODE_ENV: process.env.NODE_ENV, 
  LOG_LEVEL: process.env.LOG_LEVEL,
  loggerLevel: logger.level
}, "🚀 Server starting with configuration");

// Log token configuration (masked)
// Validate WhatsApp token format and length
if (WHATSAPP_ACCESS_TOKEN) {
  if (WHATSAPP_ACCESS_TOKEN.length < 100) {
    logger.warn({
      tokenLength: WHATSAPP_ACCESS_TOKEN.length,
      tokenPreview: `${WHATSAPP_ACCESS_TOKEN.substring(0, 20)}...`
    }, "⚠️ WHATSAPP_ACCESS_TOKEN appears to be truncated or invalid (expected >100 chars)");
  }
  if (!WHATSAPP_ACCESS_TOKEN.startsWith('EAA')) {
    logger.warn({
      tokenStart: WHATSAPP_ACCESS_TOKEN.substring(0, 10)
    }, "⚠️ WHATSAPP_ACCESS_TOKEN doesn't start with expected 'EAA' prefix");
  }
}

logger.info({ 
  hasWhatsAppToken: !!WHATSAPP_ACCESS_TOKEN,
  tokenLength: WHATSAPP_ACCESS_TOKEN?.length,
  tokenPreview: WHATSAPP_ACCESS_TOKEN ? 
    `${WHATSAPP_ACCESS_TOKEN.substring(0, 20)}...` : 
    'NO_TOKEN',
  phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
  apiVersion: GRAPH_API_VERSION,
  hasForwardAuth: !!FORWARD_AUTH_HEADER,
  forwardAuthPreview: FORWARD_AUTH_HEADER ? 
    `${FORWARD_AUTH_HEADER.substring(0, 20)}...` : 
    'NO_AUTH'
}, "🔑 Token configuration loaded");

if (!VERIFY_TOKEN || !APP_SECRET) {
  logger.warn("VERIFY_TOKEN/APP_SECRET eksik. Sadece lokal testte kabul edilebilir.");
}
if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  logger.warn("WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID eksik (outbound yok).");
}

/** ---- Express ---- */
const app = express();
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

/** ---- Graph client & helpers ---- */
const graph: AxiosInstance = axios.create({
  baseURL: `https://graph.facebook.com/${GRAPH_API_VERSION}`,
  headers: WHATSAPP_ACCESS_TOKEN
    ? { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    : undefined,
  timeout: 10000,
});

// Request interceptor - log request details
graph.interceptors.request.use((config) => {
  const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
  const authHeader = config.headers.Authorization;
  const maskedAuth = typeof authHeader === 'string' ? 
    `${authHeader.substring(0, 20)}...` : 
    undefined;
    
  const logContext = {
    method: config.method?.toUpperCase(),
    url: fullUrl,
    headers: {
      ...config.headers,
      // Mask sensitive headers
      Authorization: maskedAuth
    },
    data: config.data,
    tokenPreview: WHATSAPP_ACCESS_TOKEN ? 
      `${WHATSAPP_ACCESS_TOKEN.substring(0, 20)}...` : 
      'NO_TOKEN'
  };
  
  logger.debug(logContext, `📤 Graph API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
  return config;
});

// Response interceptor - log response details
graph.interceptors.response.use(
  (response) => {
    const logContext = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      url: response.config.url
    };
    
    logger.debug(logContext, `📥 Graph API Response: ${response.status} ${response.statusText} for ${response.config.url}`);
    return response;
  },
  (error) => {
    const logContext = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
      data: error.response?.data,
      url: error.config?.url,
      message: error.message,
      tokenPreview: WHATSAPP_ACCESS_TOKEN ? 
        `${WHATSAPP_ACCESS_TOKEN.substring(0, 20)}...` : 
        'NO_TOKEN'
    };
    
    logger.error(logContext, `❌ Graph API Error: ${error.response?.status} ${error.response?.statusText} for ${error.config?.url}`);
    return Promise.reject(error);
  }
);

async function graphSend(payload: AnyObject) {
  const logContext = {
    from: WHATSAPP_PHONE_NUMBER_ID,
    to: payload.to,
    type: payload.type,
    messageContent: payload.type === 'text' ? (payload as any).text?.body : 
                   payload.type === 'interactive' ? (payload as any).interactive?.type :
                   payload.type,
    apiEndpoint: `/${WHATSAPP_PHONE_NUMBER_ID}/messages`
  };
  
  logger.debug(logContext, `📤 Sending ${payload.type} message from bot(${WHATSAPP_PHONE_NUMBER_ID}) to user(${payload.to})`);
  
  try {
    const { data } = await graph.post(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, payload);
    const messageId = data?.messages?.[0]?.id;
    const whatsappMessageId = data?.messages?.[0]?.message_id;
    
    logger.info({ 
      ...logContext,
      messageId,
      whatsappMessageId,
      responseStatus: 'success'
    }, `✅ ${payload.type} message delivered successfully: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${payload.to}) | msgId: ${messageId}`);
    
    return data;
  } catch (error: any) {
    logger.error({ 
      ...logContext,
      error: error.message,
      httpStatus: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack
    }, `❌ Failed to send ${payload.type} message: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${payload.to}) | Error: ${error.message}`);
    throw error;
  }
}

async function sendText(to: string, body: string) {
  return graphSend({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
) {
  return graphSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    },
  });
}

type ListRow = { id: string; title: string; description?: string };
async function sendInteractiveList(
  to: string,
  headerText: string | undefined,
  bodyText: string,
  buttonText: string,
  sections: Array<{ title?: string; rows: ListRow[] }>
) {
  // Toplam row <= 10 kuralı:
  const total = sections.reduce((acc, s) => acc + s.rows.length, 0);
  if (total > 10) throw new Error("List total rows cannot exceed 10.");

  const interactive: AnyObject = {
    type: "list",
    body: { text: bodyText },
    action: {
      button: buttonText,
      sections: sections.map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: s.rows,
      })),
    },
  };
  if (headerText) interactive.header = { type: "text", text: headerText };
  return graphSend({ messaging_product: "whatsapp", to, type: "interactive", interactive });
}

/** Konum isteği – bazı bölgelerde native "location request" olabilir; yoksa fallback metin */
async function requestLocation(to: string) {
  if (String(WHATSAPP_ENABLE_LOCATION_REQUEST).toLowerCase() === "true") {
    // Uygunsa (destekliyorsa) deneyin:
    // NOT: Uygulamada destek yoksa bu çağrı 400 döndürebilir; o yüzden try/fallback yapıyoruz.
    try {
      return graphSend({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: { text: "Lütfen mevcut konumunuzu paylaşın." },
          action: { name: "send_location" },
        },
      });
    } catch (e) {
      logger.warn("Native location_request_message başarısız; fallback'a geçiliyor.");
    }
  }
  // Fallback: düz metin
  return sendText(
    to,
    "Lütfen WhatsApp'ta ataç menüsünden (📎) *Konum* seçip mevcut konumunuzu paylaşın."
  );
}

/** Amaç seçenekleri */
const PURPOSES: Array<{ id: PurposeId; title: string; description?: string }> = [
  { id: "shift_start", title: "Mesai Başlangıcı" },
  { id: "shift_end", title: "Mesai Bitimi" },
  { id: "new_task_start", title: "Yeni İşe Başlama" },
  { id: "task_finish", title: "Bir İşin Bitişi" },
  { id: "issue_report", title: "Sorun Bildirme" },
];

async function askPurposeList(to: string) {
  const rows: ListRow[] = PURPOSES.map((p) => ({
    id: `purpose:${p.id}`,
    title: p.title,
    description: p.description,
  }));
  return sendInteractiveList(
    to,
    "Lütfen amacınızı seçin",
    "Bu bildirimin amacı nedir?",
    "Seçenekler",
    [{ rows }]
  );
}

/** Mock: Kullanıcıya atanmış işler (en çok 9) */
// TODO: PROD: DB'den/servisten çek (assignments, görevler), sıralamayı iş kurallarıyla yap
function fetchAssignedJobsFor(phone: string, _purpose: PurposeId) {
  // Basit örnek: 6 iş
  return [
    { id: "J-1001", title: "Alan 3A", description: "Blok A - 3. kat mekanik montaj" },
    { id: "J-1002", title: "Pano-2", description: "Blok B - Elektrik pano kontrol" },
    { id: "J-1003", title: "Lojistik", description: "Şantiye ofis malzeme teslimi" },
    { id: "J-1004", title: "Dış cephe", description: "Isı yalıtımı kalite kontrol" },
    { id: "J-1005", title: "Blok C", description: "Asansör kuyusu temizlik" },
    { id: "J-1006", title: "Bodrum -2", description: "Acil: Su kaçağı tespiti" },
  ].slice(0, 9);
}

async function askJobList(to: string, phone: string, purpose: PurposeId) {
  const jobs = fetchAssignedJobsFor(phone, purpose);
  const rows: ListRow[] = [
    ...jobs.map((j) => ({ id: `job:${j.id}`, title: j.title, description: j.description })),
    { id: "job:independent", title: "Bunlardan bağımsız", description: "Serbest bildirim" },
  ];
  return sendInteractiveList(
    to,
    "İş seçin",
    "Size atanmış işlerden birini seçin ya da bağımsız bildirim yapın.",
    "İşler",
    [{ rows }]
  );
}

async function askNoteDecision(to: string) {
  return sendInteractiveButtons(to, "Ek açıklama veya ses kaydı eklemek ister misiniz?", [
    { id: "note:add", title: "Ekle" },
    { id: "note:skip", title: "Atla" },
  ]);
}

/** ---- İmza doğrulama ---- */
function verifySignature(req: Request & { rawBody?: Buffer }): boolean {
  if (!APP_SECRET) return true;
  const signature = req.header("X-Hub-Signature-256") ?? "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(req.rawBody ?? Buffer.alloc(0)).digest("hex");
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** ---- Media helpers (ephemeral URL / indirme) ---- */
async function getMediaUrl(mediaId: string): Promise<string> {
  const { data } = await graph.get<{ url: string }>(`/${mediaId}`);
  return data.url;
}
async function downloadMedia(mediaUrl: string, maxBytes: number) {
  const logContext = {
    url: mediaUrl,
    maxBytes,
    timeout: 20000
  };
  
  logger.debug(logContext, `📥 Media Download Request: GET ${mediaUrl}`);
  
  try {
    const res = await axios.get<ArrayBuffer>(mediaUrl, { responseType: "arraybuffer", timeout: 20000 });
    
    const responseLogContext = {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      contentLength: res.headers['content-length'],
      contentType: res.headers['content-type'],
      url: mediaUrl
    };
    
    logger.debug(responseLogContext, `📥 Media Download Response: ${res.status} ${res.statusText} for ${mediaUrl}`);
    
    const buf = Buffer.from(res.data);
    if (buf.length > maxBytes) throw new Error(`Media too large: ${buf.length} > ${maxBytes}`);
    const contentType = (res.headers["content-type"] as string) || "application/octet-stream";
    
    logger.debug({ 
      url: mediaUrl, 
      size: buf.length, 
      contentType,
      base64Length: buf.toString("base64").length 
    }, `✅ Media Download Success: ${mediaUrl} (${buf.length} bytes, ${contentType})`);
    
    return { base64: buf.toString("base64"), content_type: contentType, size: buf.length };
  } catch (error: any) {
    const errorLogContext = {
      url: mediaUrl,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers
    };
    
    logger.error(errorLogContext, `❌ Media Download Error: ${error.message} for ${mediaUrl}`);
    throw error;
  }
}

/** ---- Forward with retry (iş güncelleme mock'u için) ---- */
async function forwardWithRetry(payload: AnyObject, maxAttempts = 5): Promise<void> {
  if (!FORWARD_URL) {
    logger.debug({ payloadKind: payload.kind }, `📤 Forward skipped: No FORWARD_URL configured for ${payload.kind} payload | Data logged only`);
    return;
  }
  
  logger.debug({ url: FORWARD_URL, payloadKind: payload.kind }, `🔄 Forward initiated: Sending ${payload.kind} payload to ${FORWARD_URL} (max ${maxAttempts} attempts)`);
  let attempt = 0, delay = 500;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (FORWARD_AUTH_HEADER) headers["Authorization"] = FORWARD_AUTH_HEADER;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const requestLogContext = {
        attempt,
        delay,
        url: FORWARD_URL,
        method: 'POST',
        headers: {
          ...headers,
          // Mask auth header if present
          Authorization: headers.Authorization ? 
            `${headers.Authorization.substring(0, 20)}...` : 
            undefined
        },
        payloadSize: JSON.stringify(payload).length,
        timeout: 15000
      };
      
      logger.debug(requestLogContext, `📡 Forward attempt ${attempt}/${maxAttempts}: POST to ${FORWARD_URL} | Delay: ${delay}ms`);
      
      const response = await axios.post(FORWARD_URL, payload, { headers, timeout: 15000 });
      
      const responseLogContext = {
        attempt,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: FORWARD_URL
      };
      
      logger.debug(responseLogContext, `📥 Forward Response: ${response.status} ${response.statusText} for ${FORWARD_URL}`);
      logger.info({ attempt, payloadKind: payload.kind }, `✅ Forward success: ${payload.kind} payload delivered to ${FORWARD_URL} on attempt ${attempt}`);
      return;
    } catch (e: any) {
      const errorLogContext = {
        attempt,
        maxAttempts,
        url: FORWARD_URL,
        error: e?.message,
        status: e?.response?.status,
        statusText: e?.response?.statusText,
        headers: e?.response?.headers,
        data: e?.response?.data
      };
      
      logger.warn(errorLogContext, `❌ Forward attempt ${attempt}/${maxAttempts} failed: POST to ${FORWARD_URL} | Error: ${e?.message} | Status: ${e?.response?.status}`);
      if (attempt >= maxAttempts) {
        logger.error({ maxAttempts, payloadKind: payload.kind }, `💥 Forward completely failed: ${payload.kind} payload to ${FORWARD_URL} after ${maxAttempts} attempts | Giving up`);
        throw e;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }
}

/** ---- Normalize inbound ---- */
function normalizeMessage(msg: WhatsAppMessage): NormalizedMessage {
  const ts = Number((msg as any).timestamp || 0) * 1000;
  const base = { wa_message_id: (msg as any).id, from: (msg as any).from, timestamp: ts };
  logger.debug({ messageId: base.wa_message_id, type: (msg as any).type }, `🔄 Normalizing ${(msg as any).type} message: ${base.wa_message_id} from user(${base.from})`);

  switch (msg.type) {
    case "text":
      return { ...base, type: "text", text: (msg as any).text?.body ?? "" };
    case "image":
    case "document":
    case "audio":
    case "video": {
      const media = (msg as any)[msg.type] || {};
      return {
        ...base,
        type: msg.type as any,
        media: {
          kind: msg.type as any,
          id: media.id,
          mime_type: media.mime_type,
          sha256: media.sha256,
          filename: media.filename,
          caption: media.caption,
        },
      };
    }
    case "location":
      return {
        ...base,
        type: "location",
        location: {
          latitude: (msg as any).location?.latitude,
          longitude: (msg as any).location?.longitude,
          name: (msg as any).location?.name,
          address: (msg as any).location?.address,
        },
      };
    case "interactive":
      return { ...base, type: "interactive", interactive: (msg as any).interactive || {} };
    default:
      return { ...base, type: (msg as any).type, raw: msg as unknown as AnyObject };
  }
}

/** ---- Sağlık uçları + Webhook verify ---- */
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));
app.get("/readyz", (_req, res) => res.status(200).json({ ready: true }));
app.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(String(challenge ?? ""));
  return res.sendStatus(403);
});

/** ---- Idempotency ---- */
const seen = new TTLCache();

/** ---- Webhook (POST) ---- */
app.post("/whatsapp/webhook", (req: Request & { rawBody?: Buffer }, res: Response) => {
  logger.debug({ headers: req.headers, bodySize: req.rawBody?.length }, `🔄 Webhook POST received: ${req.rawBody?.length || 0} bytes | Headers: ${Object.keys(req.headers).join(', ')}`);
  
  if (!verifySignature(req)) {
    logger.warn({ signature: req.headers['x-hub-signature-256'] }, "❌ Signature verification failed");
    return res.sendStatus(401);
  }
  
  logger.debug(`✅ Webhook signature verified, sending 200 OK response to WhatsApp`);
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const body = req.body as WhatsAppWebhookBody;
      const entries = body?.entry ?? [];
      logger.debug({ entriesCount: entries.length }, `📦 Processing webhook: ${entries.length} entry(ies) from WhatsApp`);
      for (const entry of entries) {
        for (const ch of entry?.changes ?? []) {
          const value = ch?.value;
          if (!value) continue;

          // Status event'leri yine forward edelim (opsiyonel)
          for (const st of value.statuses ?? []) {
            const sid = st.id ?? `${st.recipient_id}:${st.status}:${st.timestamp}`;
            if (seen.has(sid)) {
              logger.debug({ statusId: sid }, `⏭️ Status update skipped: ${sid} already processed (idempotency)`);
              continue;
            }
            logger.debug({ status: st.status, recipientId: st.recipient_id }, `📊 Processing status update: ${st.status} for recipient ${st.recipient_id}`);
            seen.set(sid);
            await forwardWithRetry({ kind: "status", metadata: value.metadata, status: st });
          }

          // Messages
          for (const raw of value.messages ?? []) {
            const mid = (raw as any).id as string;
            if (!mid || seen.has(mid)) {
              logger.debug({ messageId: mid }, `⏭️ Message skipped: ${mid} already processed (idempotency)`);
              continue;
            }
            seen.set(mid);

            const msg = normalizeMessage(raw);
            const from = msg.from;
            const contentPreview = msg.type === 'text' ? (msg as any).text : 
                                   msg.type === 'location' ? `lat:${(msg as any).location?.latitude}, lng:${(msg as any).location?.longitude}` :
                                   msg.type === 'interactive' ? (msg as any).interactive?.type :
                                   msg.type;
            
            logger.info({ 
              messageId: mid, 
              from, 
              to: WHATSAPP_PHONE_NUMBER_ID,
              type: msg.type,
              content: contentPreview,
              timestamp: new Date(msg.timestamp).toISOString()
            }, `💬 Received ${msg.type} message: user(${from}) → bot(${WHATSAPP_PHONE_NUMBER_ID}) | Content: "${contentPreview}" | MsgId: ${mid}`);
            
            const s = sessions.get(from) || sessions.new(from);
            logger.debug({ from, step: s.step, sessionExists: sessions.get(from) ? true : false }, `👤 Session for user(${from}): step="${s.step}" | ${sessions.get(from) ? 'existing' : 'new'} session`);

            // --- FSM ---
            if ((msg.type === "image" || msg.type === "video") && s.step === "idle") {
              // 1) Media geldi → akışı başlat
              const mediaId = (msg as any).media?.id;
              logger.debug({ from, mediaType: msg.type, mediaId, currentStep: s.step }, `🎬 Media flow started: user(${from}) sent ${msg.type} (id:${mediaId}) | FSM: ${s.step} → awaiting_location`);
              s.media.push({ kind: msg.type, id: mediaId || "", caption: (msg as any).media?.caption });
              s.step = "awaiting_location";
              sessions.set(from, s);
              logger.debug({ from, newStep: s.step }, `📍 Location request sent: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${from}) | FSM: idle → ${s.step}`);
              await requestLocation(from);
              continue;
            }

            if (s.step === "awaiting_location" && msg.type === "location") {
              // 2) Lokasyon alındı → amaç listesi
              const location = (msg as any).location;
              logger.debug({ from, lat: location.latitude, lng: location.longitude, name: location.name }, `📍 Location received: user(${from}) shared location (${location.latitude},${location.longitude}) "${location.name}" | FSM: awaiting_location → awaiting_purpose`);
              s.location = {
                lat: location.latitude,
                lng: location.longitude,
                name: location.name,
                address: location.address,
              };
              s.step = "awaiting_purpose";
              sessions.set(from, s);
              logger.debug({ from, newStep: s.step }, `🎯 Purpose list sent: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${from}) | FSM: awaiting_location → ${s.step}`);
              await askPurposeList(from);
              continue;
            }

            if (s.step === "awaiting_purpose" && msg.type === "interactive" && (msg as any).interactive?.list_reply) {
              // 3) Amaç seçildi → iş listesi
              const id = String((msg as any).interactive.list_reply.id || "");
              if (id.startsWith("purpose:")) {
                s.purpose = id.slice("purpose:".length) as PurposeId;
                s.step = "awaiting_task";
                sessions.set(from, s);
                await askJobList(from, from, s.purpose);
              }
              continue;
            }

            if (s.step === "awaiting_task" && msg.type === "interactive" && (msg as any).interactive?.list_reply) {
              // 4) İş seçildi → not kararı
              const id = String((msg as any).interactive.list_reply.id || "");
              if (id.startsWith("job:")) {
                s.selectedTaskId = id.slice("job:".length);
                s.step = "awaiting_note_decision";
                sessions.set(from, s);
                await askNoteDecision(from);
              }
              continue;
            }

            if (s.step === "awaiting_note_decision" && msg.type === "interactive" && (msg as any).interactive?.button_reply) {
              // 5) Not ekle / atla
              const id = String((msg as any).interactive.button_reply.id || "");
              if (id === "note:skip") {
                await finalizeAndUpdateJob(s, value.metadata);
                sessions.complete(from);
                continue;
              }
              if (id === "note:add") {
                s.step = "awaiting_extra";
                sessions.set(from, s);
                await sendText(from, "Lütfen ek açıklamayı yazın veya bir ses kaydı gönderin.");
              }
              continue;
            }

            if (s.step === "awaiting_extra") {
              // 6) Text veya audio topla → finalize
              if (msg.type === "text" && !(msg as any).text?.startsWith("/")) {
                s.extraNote = (msg as any).text;
                await finalizeAndUpdateJob(s, value.metadata);
                sessions.complete(from);
                continue;
              }
              if (msg.type === "audio") {
                const a = (msg as any).media;
                s.extraAudio = { id: a?.id, mime_type: a?.mime_type };
                await finalizeAndUpdateJob(s, value.metadata);
                sessions.complete(from);
                continue;
              }
              // Başka şey geldiyse görmezden gel ve kullanıcıyı yönlendir:
              await sendText(from, "Ek açıklamayı metin olarak yazabilir veya ses kaydı gönderebilirsiniz.");
              continue;
            }

            // Kullanıcı akış dışı ek görsel/video gönderdiyse: yeni medya'yı da ekle, lokasyonu istemeye devam et
            if ((msg.type === "image" || msg.type === "video") && (s.step === "awaiting_location" || s.step === "idle")) {
              const mediaId = (msg as any).media?.id;
              s.media.push({ kind: msg.type, id: mediaId || "", caption: (msg as any).media?.caption });
              sessions.set(from, s);
              if (s.step === "idle") {
                s.step = "awaiting_location";
                sessions.set(from, s);
                await requestLocation(from);
              }
              continue;
            }

            // Diğer mesajları (serbest metin vs.) ack'leyip akış durumuna göre yönlendir
            if (s.step === "awaiting_location") {
              await sendText(from, "Lütfen 📎 menüsünden *Konum* paylaşın, sonra devam edeceğiz.");
            } else if (s.step === "awaiting_purpose") {
              await sendText(from, "Lütfen bir amaç seçin (gönderdiğim listeden).");
            } else if (s.step === "awaiting_task") {
              await sendText(from, "Lütfen bir iş seçin (listeden).");
            } else if (s.step === "awaiting_note_decision") {
              await sendText(from, "Not eklemek ister misiniz? *Ekle* veya *Atla* butonuna dokunun.");
            }
          } // messages
        } // changes
      } // entries
    } catch (err: any) {
      logger.error({ 
        error: err?.message, 
        stack: err?.stack,
        requestBody: req.body,
        headers: req.headers
      }, `💥 Critical webhook processing error: ${err?.message} | Request body size: ${JSON.stringify(req.body).length} chars`);
    }
  });
});

/** ---- İş güncelle (mock) + forward ---- */
// TODO PROD: Burada gerçek "iş güncelleme" entegrasyonunu yapın
async function finalizeAndUpdateJob(s: Session, metadata?: AnyObject) {
  // Medyaları ephemeral URL veya base64 ile forward edelim (kısa ömürlü oldukları için hızlı davranın)
  const mediaPack = [];
  for (const m of s.media) {
    try {
      const url = await getMediaUrl(m.id);
      mediaPack.push({ kind: m.kind, id: m.id, media_url: url, caption: m.caption });
    } catch (e: any) {
      mediaPack.push({ kind: m.kind, id: m.id, error: e?.message });
    }
  }

  const payload = {
    kind: "job_update",
    user: s.user,
    purpose: s.purpose,
    selectedTaskId: s.selectedTaskId, // "independent" olabilir
    location: s.location,
    media: mediaPack,
    extra: {
      note: s.extraNote,
      audio: s.extraAudio,
    },
    metadata,
    // TODO: PROD: burada iş-olay numarası üretip DB'ye yazın; audit trail/log ekleyin
  };

  await forwardWithRetry(payload);
  await sendText(
    s.user,
    "Teşekkürler, bildiriminiz alındı ve iş üzerine kaydedildi."
  );
}

/** ---- (Opsiyonel) Debug outbound ---- */
app.post("/send/text", async (req: Request, res: Response) => {
  try {
    const { to, body } = (req.body || {}) as { to?: string; body?: string };
    if (!to || !body) return res.status(400).json({ error: "to & body required" });
    const data = await sendText(to, body);
    res.status(200).json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

app.listen(Number(PORT), () => logger.info(`Webhook listening on :${PORT}`));

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
import { sessions, Session, Step } from "./state/session";

dotenv.config();

/** ---- Env ---- */
const {
  PORT = "3000",
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  APP_SECRET,
  FORWARD_URL,
  FORWARD_AUTH_HEADER,
  WHATSAPP_ENABLE_LOCATION_REQUEST,
  MEDIA_MAX_BYTES = "20971520", // 20MB
} = process.env;

if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !VERIFY_TOKEN) {
  logger.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

app.use(express.raw({ type: "application/json" }));
app.use((req: Request & { rawBody?: Buffer }, res: Response, next) => {
  if (req.method === "POST" && req.headers["content-type"] === "application/json") {
    req.rawBody = req.body;
    req.body = JSON.parse(req.body.toString());
  }
  next();
});

/** ---- Graph API client with interceptors ---- */
const graph: AxiosInstance = axios.create({
  baseURL: "https://graph.facebook.com/v21.0",
  headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
});

// Request interceptor
graph.interceptors.request.use(
  (config) => {
    const logContext = {
      method: config.method?.toUpperCase(),
      url: (config.baseURL || '') + (config.url || ''),
      headers: {
        ...config.headers,
        Authorization: config.headers?.Authorization ? 
          `${String(config.headers.Authorization).substring(0, 20)}...` : 
          undefined
      },
      data: config.data ? JSON.stringify(config.data).length : 0
    };
    
    logger.debug(logContext, `📡 Graph API Request: ${config.method?.toUpperCase()} ${config.url} | Data size: ${logContext.data} bytes`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
graph.interceptors.response.use(
  (response) => {
    const logContext = {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url,
      method: response.config.method?.toUpperCase(),
      responseSize: JSON.stringify(response.data).length
    };
    
    logger.debug(logContext, `📥 Graph API Response: ${response.status} ${response.statusText} for ${response.config.method?.toUpperCase()} ${response.config.url} | Size: ${logContext.responseSize} bytes`);
    return response;
  },
  (error) => {
    const logContext = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      error: error.message,
      data: error.response?.data
    };
    
    logger.error(logContext, `❌ Graph API Error: ${error.response?.status} ${error.response?.statusText} for ${error.config?.method?.toUpperCase()} ${error.config?.url} | Error: ${error.message}`);
    return Promise.reject(error);
  }
);

/** ---- Graph send helper ---- */
async function graphSend(payload: AnyObject) {
  const logPayload: any = {
    to: payload.to,
    type: payload.type,
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID,
    payload_size: JSON.stringify(payload).length
  };
  
  // Add content details to outgoing message logs
  if (payload.type === 'text') {
    logPayload.textContent = (payload as any).text?.body;
  } else if (payload.type === 'interactive') {
    logPayload.interactiveData = {
      type: (payload as any).interactive?.type,
      body: (payload as any).interactive?.body?.text,
      buttons: (payload as any).interactive?.action?.buttons,
      sections: (payload as any).interactive?.action?.sections
    };
  }
  
  logger.debug(logPayload, `📤 Sending ${payload.type} message: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${payload.to}) | Size: ${logPayload.payload_size} bytes`);

  try {
    const { data } = await graph.post(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      ...payload,
      messaging_product: "whatsapp"
    });
    
    const sentLogData: any = { 
      event: 'MESSAGE_SENT',
      messageId: data.messages?.[0]?.id,
      to: payload.to,
      type: payload.type,
      status: 'sent',
      timestamp: new Date().toISOString()
    };
    
    // Include content in sent message logs
    if (payload.type === 'text') {
      sentLogData.textContent = (payload as any).text?.body;
    } else if (payload.type === 'interactive') {
      sentLogData.interactiveContent = (payload as any).interactive?.body?.text;
      sentLogData.interactiveType = (payload as any).interactive?.type;
    }
    
    logger.info(sentLogData, `✅ Message sent successfully: bot(${WHATSAPP_PHONE_NUMBER_ID}) → user(${payload.to}) | Type: ${payload.type} | ID: ${data.messages?.[0]?.id}`);
    
    return data;
  } catch (error: any) {
    logger.error({
      to: payload.to,
      type: payload.type,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
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

/** Location request */
async function requestLocation(to: string) {
  if (String(WHATSAPP_ENABLE_LOCATION_REQUEST).toLowerCase() === "true") {
    try {
      return await graphSend({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: { text: "Lütfen mevcut konumunuzu paylaşın." },
          action: { name: "send_location" },
        },
      });
    } catch (e: any) {
      logger.warn({ 
        error: e.message, 
        status: e.response?.status, 
        statusText: e.response?.statusText,
        to 
      }, "❌ Native location_request_message failed; falling back to text message");
    }
  }
  return await sendText(
    to,
    "Lütfen WhatsApp'ta ataç menüsünden (📎) *Konum* seçip mevcut konumunuzu paylaşın."
  );
}

// Helper function for two-part state transition logging
function transitionState(
  session: Session, 
  newState: Step, 
  trigger: string, 
  messageId: string
): Session {
  const oldState = session.step;
  const transitionStartTime = Date.now();
  
  // LOG: STATE_TRANSITION_BEGIN
  logger.info({
    event: 'STATE_TRANSITION_BEGIN',
    phone: session.user,
    workflowId: session.workflowId,
    messageId,
    fromState: oldState,
    trigger,
    timestamp: new Date().toISOString()
  }, `🔄 STATE_TRANSITION_BEGIN: Phone: ${session.user} | Workflow: ${session.workflowId} | Message: ${messageId} | From: ${oldState} | Trigger: ${trigger}`);
  
  // Perform the actual state change
  session.step = newState;
  session.lastActivityAt = Date.now();
  sessions.set(session.user, session);
  
  // LOG: STATE_TRANSITION_END
  logger.info({
    event: 'STATE_TRANSITION_END',
    phone: session.user,
    workflowId: session.workflowId,
    messageId,
    fromState: oldState,
    toState: newState,
    trigger,
    transitionDuration: Date.now() - transitionStartTime,
    timestamp: new Date().toISOString()
  }, `✅ STATE_TRANSITION_END: Phone: ${session.user} | Workflow: ${session.workflowId} | Message: ${messageId} | Transition: ${oldState} → ${newState} | Trigger: ${trigger}`);
  
  return session;
}

// Helper function to handle mid-flow image decision
async function handleMidFlowImage(from: string, session: Session, messageId: string) {
  if (session.hasDescriptions) {
    logger.info({
      event: 'MID_FLOW_MEDIA_DECISION',
      phone: from,
      workflowId: session.workflowId,
      messageId,
      currentState: session.step,
      descriptionsCount: session.descriptions.length,
      timestamp: new Date().toISOString()
    }, `❓ MID_FLOW_MEDIA_DECISION: Phone: ${from} | Workflow: ${session.workflowId} | Message: ${messageId} | Descriptions: ${session.descriptions.length}`);
    
    return sendInteractiveButtons(from, 
      "Mevcut akışı kaydedip yeni akış başlatmak ister misiniz?",
      [
        {id: "save_new", title: "Evet"}, 
        {id: "continue", title: "Hayır"}
      ]
    );
  } else {
    logger.info({
      event: 'MID_FLOW_NO_DESCRIPTIONS',
      phone: from,
      workflowId: session.workflowId,
      messageId,
      timestamp: new Date().toISOString()
    }, `❓ MID_FLOW_NO_DESCRIPTIONS: Phone: ${from} | Workflow: ${session.workflowId} | Message: ${messageId}`);
    
    return sendText(from, "Henüz açıklama yapmadınız. Lütfen sesli veya yazılı açıklama gönderin.");
  }
}

/** ---- Signature verification ---- */
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

/** ---- Media helpers (ephemeral URL / download) ---- */
async function getMediaUrl(mediaId: string): Promise<string> {
  const { data } = await graph.get<{ url: string }>(`/${mediaId}`);
  return data.url;
}

async function downloadMedia(mediaUrl: string, maxBytes: number) {
  try {
    const res = await axios.get<ArrayBuffer>(mediaUrl, { responseType: "arraybuffer", timeout: 20000 });
    const buf = Buffer.from(res.data);
    if (buf.length > maxBytes) throw new Error(`Media too large: ${buf.length} > ${maxBytes}`);
    const contentType = (res.headers["content-type"] as string) || "application/octet-stream";
    return { base64: buf.toString("base64"), content_type: contentType, size: buf.length };
  } catch (error: any) {
    logger.error({ url: mediaUrl, error: error.message }, `❌ Media Download Error`);
    throw error;
  }
}

/** ---- Forward with retry ---- */
async function forwardWithRetry(payload: AnyObject, maxAttempts = 5): Promise<void> {
  if (!FORWARD_URL) {
    logger.debug({ payloadKind: payload.kind }, `📤 Forward skipped: No FORWARD_URL configured`);
    return;
  }
  
  let attempt = 0, delay = 500;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (FORWARD_AUTH_HEADER) headers["Authorization"] = FORWARD_AUTH_HEADER;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      logger.debug({ attempt, url: FORWARD_URL }, `📡 Forward attempt ${attempt}/${maxAttempts}`);
      
      const response = await axios.post(FORWARD_URL, payload, { headers, timeout: 15000 });
      
      logger.info({ attempt, payloadKind: payload.kind }, `✅ Forward success`);
      return;
    } catch (e: any) {
      logger.warn({ attempt, maxAttempts, error: e?.message }, `❌ Forward attempt ${attempt}/${maxAttempts} failed`);
      if (attempt >= maxAttempts) {
        logger.error({ maxAttempts, payloadKind: payload.kind }, `💥 Forward completely failed`);
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/** ---- Message normalization ---- */
function normalizeMessage(raw: WhatsAppMessage): NormalizedMessage {
  const ts = Number((raw as any).timestamp) * 1000 || Date.now();
  const base = { 
    wa_message_id: (raw as any).id, 
    from: (raw as any).from, 
    timestamp: ts,
    context: (raw as any).context  // Preserve context for reply detection
  };

  switch (raw.type) {
    case "text":
      return { ...base, type: "text", text: (raw as any).text?.body || "" };
    case "image":
    case "document":
    case "audio":
    case "video":
      const media = (raw as any)[raw.type];
      return {
        ...base,
        type: raw.type,
        media: {
          kind: raw.type,
          id: media?.id,
          mime_type: media?.mime_type,
          sha256: media?.sha256,
          filename: media?.filename,
          caption: media?.caption,
        },
      };
    case "location":
      return { ...base, type: "location", location: (raw as any).location || {} };
    case "interactive":
      return { ...base, type: "interactive", interactive: (raw as any).interactive || {} };
    default:
      return { ...base, type: raw.type, raw: raw as unknown as AnyObject };
  }
}

/** ---- Health endpoints + Webhook verify ---- */
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

// 2-minute timeout cleanup
async function cleanupInactiveSessions() {
  const now = Date.now();
  const timeoutMs = 120000; // 2 minutes
  
  for (const [phone, session] of (sessions as any).map.entries()) {
    const idleTime = now - session.lastActivityAt;
    
    // Only timeout active workflows, not idle sessions
    if (session.step !== 'idle' && idleTime > timeoutMs) {
      logger.warn({
        event: 'WORKFLOW_TIMEOUT',
        phone,
        workflowId: session.workflowId,
        lastState: session.step,
        idleTime,
        lastActivityAt: new Date(session.lastActivityAt).toISOString(),
        descriptionsCollected: session.descriptions.length,
        timestamp: new Date().toISOString()
      }, `⏱️ WORKFLOW_TIMEOUT: Phone: ${phone} | Workflow: ${session.workflowId} | State: ${session.step} | Idle: ${idleTime}ms`);
      
      await sendText(phone, "⏱️ Akış zaman aşımına uğradı. Yeni görsel göndererek başlayın.");
      sessions['map'].delete(phone);
      
      logger.info({
        event: 'SESSION_DELETED',
        phone,
        workflowId: session.workflowId,
        reason: 'timeout',
        timestamp: new Date().toISOString()
      }, `🗑️ SESSION_DELETED: Phone: ${phone} | Workflow: ${session.workflowId} | Reason: timeout`);
    }
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupInactiveSessions, 30000);

/** ---- Workflow completion ---- */
async function finalizeWorkflow(session: Session, triggerMessageId: string) {
  const duration = Date.now() - session.createdAt;
  
  logger.info({
    event: 'WORKFLOW_FINALIZATION_BEGIN',
    phone: session.user,
    workflowId: session.workflowId,
    messageId: triggerMessageId,
    timestamp: new Date().toISOString()
  }, `🏁 WORKFLOW_FINALIZATION_BEGIN: Phone: ${session.user} | Workflow: ${session.workflowId} | Message: ${triggerMessageId}`);
  
  // Prepare and forward data
  const payload = {
    kind: "workflow_complete",
    workflowId: session.workflowId,
    user: session.user,
    location: session.location,
    media: session.media,
    descriptions: session.descriptions,
    workflow_start: session.createdAt,
    workflow_end: Date.now(),
    duration
  };
  
  try {
    await forwardWithRetry(payload);
    
    logger.info({
      event: 'WORKFLOW_DATA_FORWARDED',
      phone: session.user,
      workflowId: session.workflowId,
      forwardUrl: FORWARD_URL || 'none',
      payloadSize: JSON.stringify(payload).length,
      timestamp: new Date().toISOString()
    }, `📤 WORKFLOW_DATA_FORWARDED: Phone: ${session.user} | Workflow: ${session.workflowId} | Size: ${JSON.stringify(payload).length} bytes`);
    
  } catch (error: any) {
    logger.error({
      event: 'WORKFLOW_FORWARD_FAILED',
      phone: session.user,
      workflowId: session.workflowId,
      error: error.message,
      timestamp: new Date().toISOString()
    }, `❌ WORKFLOW_FORWARD_FAILED: Phone: ${session.user} | Workflow: ${session.workflowId} | Error: ${error.message}`);
  }
  
  await sendText(session.user, "✅ Teşekkürler, açıklamanız alındı ve kaydedildi.");
  
  logger.info({
    event: 'WORKFLOW_COMPLETE',
    phone: session.user,
    workflowId: session.workflowId,
    messageId: triggerMessageId,
    duration,
    metrics: {
      mediaCount: session.media.length,
      descriptionsCount: session.descriptions.length,
      textDescriptions: session.descriptions.filter(d => d.type === 'text').length,
      audioDescriptions: session.descriptions.filter(d => d.type === 'audio').length
    },
    timestamp: new Date().toISOString()
  }, `✅ WORKFLOW_COMPLETE: Phone: ${session.user} | Workflow: ${session.workflowId} | Duration: ${duration}ms | Descriptions: ${session.descriptions.length}`);
}

/** ---- Webhook (POST) ---- */
app.post("/whatsapp/webhook", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  logger.debug({ headers: req.headers, bodySize: req.rawBody?.length }, `🔄 Webhook POST received`);
  
  if (!verifySignature(req)) {
    logger.warn({ signature: req.headers['x-hub-signature-256'] }, "❌ Signature verification failed");
    return res.sendStatus(401);
  }
  
  logger.debug(`✅ Webhook signature verified`);

  try {
    const body = req.body as WhatsAppWebhookBody;
    const entries = body?.entry ?? [];
    logger.debug({ entriesCount: entries.length }, `📦 Processing webhook: ${entries.length} entries`);
    
    for (const entry of entries) {
      for (const ch of entry?.changes ?? []) {
        const value = ch?.value;
        if (!value) continue;

        // Status events
        for (const st of value.statuses ?? []) {
          const sid = st.id ?? `${st.recipient_id}:${st.status}:${st.timestamp}`;
          if (seen.has(sid)) continue;
          logger.debug({ status: st.status, recipientId: st.recipient_id }, `📊 Processing status update`);
          seen.set(sid);
          await forwardWithRetry({ kind: "status", metadata: value.metadata, status: st } as AnyObject);
        }

        // Messages
        for (const raw of value.messages ?? []) {
          const mid = (raw as any).id as string;
          if (!mid || seen.has(mid)) continue;
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
          
          // Log message received with full content
          const logData: any = {
            event: 'MESSAGE_RECEIVED',
            phone: from,
            messageId: mid,
            messageType: msg.type,
            timestamp: new Date().toISOString()
          };
          
          // Add type-specific content to logs
          if (msg.type === 'text') {
            logData.textContent = (msg as any).text;
          } else if (msg.type === 'location') {
            logData.locationData = (msg as any).location;
          } else if (msg.type === 'interactive') {
            logData.interactiveData = (msg as any).interactive;
          } else if (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || msg.type === 'document') {
            logData.mediaData = {
              id: (msg as any).media?.id,
              mime_type: (msg as any).media?.mime_type,
              caption: (msg as any).media?.caption,
              filename: (msg as any).media?.filename
            };
          }
          
          logger.info(logData, `📨 MESSAGE_RECEIVED: Phone: ${from} | Message: ${mid} | Type: ${msg.type} | Content: "${contentPreview}"`);
          
          let s = sessions.get(from) || sessions.new(from);
          
          logger.debug({
            event: 'SESSION_STATE_CHECK',
            phone: from,
            workflowId: s.workflowId,
            currentState: s.step,
            messageId: mid,
            messageType: msg.type,
            timestamp: new Date().toISOString()
          }, `🔍 SESSION_STATE_CHECK: Phone: ${from} | State: ${s.step} | Workflow: ${s.workflowId} | MessageType: ${msg.type}`);

          // --- SIMPLIFIED FSM ---
          
          // GLOBAL: Image/Video handler (resets FSM from any state)
          if (msg.type === "image" || msg.type === "video") {
            const mediaId = (msg as any).media?.id || (msg as any).image?.id || (msg as any).video?.id;
            
            // Handle mid-flow image/video
            if (s.step === "awaiting_description") {
              await handleMidFlowImage(from, s, mid);
              continue;
            }
            
            // Reset workflow
            const oldWorkflowId = s.workflowId || 'none';
            const newWorkflowId = `wf_${Date.now()}_${from.slice(-4)}`;
            
            logger.info({
              event: 'WORKFLOW_RESET',
              phone: from,
              oldWorkflowId,
              newWorkflowId,
              messageId: mid,
              previousState: s.step,
              reason: 'new_media',
              timestamp: new Date().toISOString()
            }, `🔄 WORKFLOW_RESET: Phone: ${from} | Old: ${oldWorkflowId} | New: ${newWorkflowId} | Message: ${mid}`);
            
            s = sessions.new(from);
            s.workflowId = newWorkflowId;
            s.media.push({type: msg.type as "image" | "video", id: mediaId});
            
            // Ensure session is properly saved before transition
            sessions.set(from, s);
            
            transitionState(s, 'awaiting_location', `${msg.type}_received`, mid);
            await requestLocation(from);
            continue;
          }
          
          // Handle mid-flow button decisions
          if (s.step === "awaiting_description" && msg.type === "interactive" && (msg as any).interactive?.button_reply) {
            const buttonId = (msg as any).interactive.button_reply.id;
            
            if (buttonId === "save_new") {
              logger.info({
                event: 'WORKFLOW_SAVE_AND_NEW',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                timestamp: new Date().toISOString()
              }, `💾 WORKFLOW_SAVE_AND_NEW: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid}`);
              
              // Finalize current workflow first
              await finalizeWorkflow(s, mid);
              
              // Create new workflow
              const newWorkflowId = `wf_${Date.now()}_${from.slice(-4)}`;
              s = sessions.new(from);
              s.workflowId = newWorkflowId;
              
              await sendText(from, "✅ Mevcut açıklamanız kaydedildi. Şimdi yeni bir akışa başlıyoruz.");
              await sendText(from, "📸 Yeni görsel veya video gönderin.");
              continue;
              
            } else if (buttonId === "continue") {
              logger.info({
                event: 'WORKFLOW_CONTINUE',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                timestamp: new Date().toISOString()
              }, `▶️ WORKFLOW_CONTINUE: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid}`);
              
              await sendText(from, "📝 Mevcut konuyu açıklamaya devam edin.");
              continue;
            }
          }
          
          // State-specific handlers
          switch(s.step) {
            case 'idle':
              if (msg.type !== 'image' && msg.type !== 'video') {
                logger.info({
                  event: 'IDLE_NON_MEDIA_MESSAGE',
                  phone: from,
                  messageId: mid,
                  messageType: msg.type,
                  timestamp: new Date().toISOString()
                }, `💤 IDLE_NON_MEDIA_MESSAGE: Phone: ${from} | Message: ${mid} | Type: ${msg.type}`);
                
                await sendText(from, "📸 Başlamak için görsel veya video gönderin.");
              }
              break;
              
            case 'awaiting_location':
              if (msg.type === 'location') {
                logger.info({
                  event: 'LOCATION_RECEIVED',
                  phone: from,
                  workflowId: s.workflowId,
                  messageId: mid,
                  location: {
                    lat: (msg as any).location?.latitude,
                    lng: (msg as any).location?.longitude,
                    name: (msg as any).location?.name
                  },
                  timestamp: new Date().toISOString()
                }, `📍 LOCATION_RECEIVED: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid}`);
                
                s.location = (msg as any).location;
                transitionState(s, 'awaiting_description', 'location_received', mid);
                await sendText(from, "🎤 Lütfen sesli veya yazılı açıklama yapın.");
              } else {
                logger.info({
                  event: 'INVALID_MESSAGE_TYPE',
                  phone: from,
                  workflowId: s.workflowId,
                  messageId: mid,
                  expectedType: 'location',
                  receivedType: msg.type,
                  currentState: s.step,
                  timestamp: new Date().toISOString()
                }, `⚠️ INVALID_MESSAGE_TYPE: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Expected: location | Got: ${msg.type}`);
                
                await requestLocation(from);
              }
              break;
              
            case 'awaiting_description':
              if (msg.type === 'text' || msg.type === 'audio') {
                const descriptionIndex = s.descriptions.length + 1;
                
                logger.info({
                  event: 'DESCRIPTION_ADDED',
                  phone: from,
                  workflowId: s.workflowId,
                  messageId: mid,
                  descriptionType: msg.type,
                  descriptionIndex,
                  totalDescriptions: descriptionIndex,
                  timestamp: new Date().toISOString()
                }, `📝 DESCRIPTION_ADDED: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Type: ${msg.type} | Index: ${descriptionIndex}`);
                
                s.descriptions.push({
                  type: msg.type as 'text'|'audio',
                  content: msg.type === 'text' ? (msg as any).text : (msg as any).media?.id,
                  timestamp: Date.now()
                });
                s.hasDescriptions = true;
                sessions.set(from, s);
                
                await sendInteractiveButtons(from, 
                  "✅ Açıklamanız bittiyse Tamam'a basın.\n📝 Bitmediyse ses kaydı veya yazılı açıklama göndermeye devam edin.",
                  [{id: "complete", title: "Tamam"}]
                );
                
              } else if (msg.type === 'interactive' && (msg as any).interactive?.button_reply?.id === 'complete') {
                logger.info({
                  event: 'COMPLETION_TRIGGERED',
                  phone: from,
                  workflowId: s.workflowId,
                  messageId: mid,
                  descriptionsCount: s.descriptions.length,
                  timestamp: new Date().toISOString()
                }, `🏁 COMPLETION_TRIGGERED: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Descriptions: ${s.descriptions.length}`);
                
                await finalizeWorkflow(s, mid);
                transitionState(s, 'completed', 'user_completed', mid);
              } else {
                logger.info({
                  event: 'INVALID_MESSAGE_DURING_DESCRIPTION',
                  phone: from,
                  workflowId: s.workflowId,
                  messageId: mid,
                  messageType: msg.type,
                  timestamp: new Date().toISOString()
                }, `⚠️ INVALID_MESSAGE_DURING_DESCRIPTION: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Type: ${msg.type}`);
                
                await sendText(from, 
                  "💬 Lütfen sesli veya yazılı açıklama yapın.\n\n" +
                  "🔄 Yeniden başlamak için görsel/video gönderin."
                );
              }
              break;
            
            case 'completed':
              logger.info({
                event: 'MESSAGE_AFTER_COMPLETION',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                messageType: msg.type,
                timestamp: new Date().toISOString()
              }, `✅ MESSAGE_AFTER_COMPLETION: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Type: ${msg.type}`);
              
              await sendText(from, "📸 Yeni bir bildirim için görsel veya video gönderin.");
              break;
          }
          
          // Log message processing complete
          logger.info({
            event: 'MESSAGE_PROCESSED',
            phone: from,
            workflowId: s.workflowId,
            messageId: mid,
            finalState: s.step,
            timestamp: new Date().toISOString()
          }, `✅ MESSAGE_PROCESSED: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | State: ${s.step}`);
          
        } // messages
      } // changes
    } // entries
  } catch (err: any) {
    logger.error({ 
      error: err?.message, 
      stack: err?.stack,
      requestBody: req.body,
      headers: req.headers
    }, `💥 Critical webhook processing error: ${err?.message}`);
  }
  
  res.sendStatus(200);
});

/** ---- Debug outbound ---- */
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
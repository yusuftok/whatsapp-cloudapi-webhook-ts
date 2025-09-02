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
import { transcribeBuffer } from "./stt/transcribe";
import { extractMultipleFromText, extractFromText } from "./nlp/extract";
import { fetchMediaUrl, downloadMediaBuffer } from "./services/waMedia";
import { enqueueForHumanReview } from "./services/reviewQueue";

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
async function handleMidFlowImage(
  from: string, 
  session: Session, 
  messageId: string,
  mediaData: { type: "image" | "video"; id: string; caption?: string }
) {
  // Store media data temporarily for button handler
  (session as any).pendingMedia = mediaData;
  sessions.set(from, session);
  
  if (session.hasDescriptions) {
    logger.info({
      event: 'MID_FLOW_MEDIA_DECISION',
      phone: from,
      workflowId: session.workflowId,
      messageId,
      currentState: session.step,
      descriptionsCount: session.descriptions.length,
      mediaType: mediaData.type,
      mediaId: mediaData.id,
      timestamp: new Date().toISOString()
    }, `❓ MID_FLOW_MEDIA_DECISION: Phone: ${from} | Workflow: ${session.workflowId} | Message: ${messageId} | Descriptions: ${session.descriptions.length} | Media: ${mediaData.type}`);
    
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
      mediaType: mediaData.type,
      timestamp: new Date().toISOString()
    }, `❓ MID_FLOW_NO_DESCRIPTIONS: Phone: ${from} | Workflow: ${session.workflowId} | Message: ${messageId} | Media: ${mediaData.type}`);
    
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

/** ---- Phone normalization for consistent session keys ---- */
function normalizePhone(phone: string): string {
  // Remove all non-digits and normalize format
  // +905551234567 → 905551234567
  // 905551234567 → 905551234567  
  // 5551234567 → 5551234567
  return phone.replace(/^\+/, '').replace(/[^\d]/g, '');
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
    
    // Only timeout active workflows, not idle or completed sessions
    if (session.step !== 'idle' && session.step !== 'completed' && idleTime > timeoutMs) {
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
      
      // Don't send timeout message immediately - just cleanup session
      // User will get "send image/video" message naturally when they send next message
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

/** ---- Helper functions for description step ---- */

// Process and concatenate all descriptions (text + audio transcription)
async function processAndConcatenateDescriptions(session: Session): Promise<string> {
  const processedDescriptions: string[] = [];
  
  try {
    for (const desc of session.descriptions) {
      if (desc.type === 'text') {
        processedDescriptions.push(desc.content);
        logger.debug({
          event: 'TEXT_DESCRIPTION_PROCESSED',
          phone: session.user,
          workflowId: session.workflowId,
          content: desc.content.substring(0, 100) + '...',
          timestamp: new Date().toISOString()
        }, `📝 TEXT_DESCRIPTION_PROCESSED: Phone: ${session.user} | Content: ${desc.content.substring(0, 50)}...`);
        
      } else if (desc.type === 'audio') {
        try {
          logger.info({
            event: 'AUDIO_TRANSCRIPTION_START',
            phone: session.user,
            workflowId: session.workflowId,
            audioId: desc.content,
            timestamp: new Date().toISOString()
          }, `🎤 AUDIO_TRANSCRIPTION_START: Phone: ${session.user} | AudioID: ${desc.content}`);
          
          // Get audio media URL and download
          const { url: audioUrl, mime } = await fetchMediaUrl(desc.content);
          const audioBuffer = await downloadMediaBuffer(audioUrl);
          
          // Transcribe audio
          const transcriptionResult = await transcribeBuffer(audioBuffer, "audio.ogg", mime || "audio/ogg");
          processedDescriptions.push(transcriptionResult.text);
          
          logger.info({
            event: 'AUDIO_TRANSCRIPTION_SUCCESS',
            phone: session.user,
            workflowId: session.workflowId,
            audioId: desc.content,
            transcribedText: transcriptionResult.text.substring(0, 100) + '...',
            timestamp: new Date().toISOString()
          }, `✅ AUDIO_TRANSCRIPTION_SUCCESS: Phone: ${session.user} | Text: ${transcriptionResult.text.substring(0, 50)}...`);
          
        } catch (error: any) {
          logger.error({
            event: 'AUDIO_TRANSCRIPTION_FAILED',
            phone: session.user,
            workflowId: session.workflowId,
            audioId: desc.content,
            error: error.message,
            timestamp: new Date().toISOString()
          }, `❌ AUDIO_TRANSCRIPTION_FAILED: Phone: ${session.user} | AudioID: ${desc.content} | Error: ${error.message}`);
          
          processedDescriptions.push(`[Ses kaydı transkript edilemedi: ${error.message}]`);
        }
      }
    }
    
    const concatenated = processedDescriptions.join(' | ');
    
    logger.info({
      event: 'DESCRIPTIONS_CONCATENATED',
      phone: session.user,
      workflowId: session.workflowId,
      totalDescriptions: session.descriptions.length,
      concatenatedLength: concatenated.length,
      preview: concatenated.substring(0, 200) + '...',
      timestamp: new Date().toISOString()
    }, `📋 DESCRIPTIONS_CONCATENATED: Phone: ${session.user} | Total: ${session.descriptions.length} | Length: ${concatenated.length}`);
    
    return concatenated;
    
  } catch (error: any) {
    logger.error({
      event: 'DESCRIPTION_PROCESSING_FAILED',
      phone: session.user,
      workflowId: session.workflowId,
      error: error.message,
      timestamp: new Date().toISOString()
    }, `❌ DESCRIPTION_PROCESSING_FAILED: Phone: ${session.user} | Error: ${error.message}`);
    
    return "Açıklama işlenirken hata oluştu.";
  }
}

// Extract work items from concatenated text
async function extractWorkItemsFromText(session: Session, concatenatedDescription: string): Promise<any> {
  try {
    logger.info({
      event: 'EXTRACTION_START',
      phone: session.user,
      workflowId: session.workflowId,
      textLength: concatenatedDescription.length,
      timestamp: new Date().toISOString()
    }, `🔍 EXTRACTION_START: Phone: ${session.user} | TextLength: ${concatenatedDescription.length}`);
    
    const extractionResult = await extractMultipleFromText(concatenatedDescription);
    
    logger.info({
      event: 'EXTRACTION_SUCCESS',
      phone: session.user,
      workflowId: session.workflowId,
      extractionsCount: extractionResult.extractions.length,
      overallSummary: extractionResult.overall_summary,
      timestamp: new Date().toISOString()
    }, `✅ EXTRACTION_SUCCESS: Phone: ${session.user} | Extractions: ${extractionResult.extractions.length} | Summary: ${extractionResult.overall_summary}`);
    
    return extractionResult;
    
  } catch (error: any) {
    logger.error({
      event: 'EXTRACTION_FAILED',
      phone: session.user,
      workflowId: session.workflowId,
      error: error.message,
      timestamp: new Date().toISOString()
    }, `❌ EXTRACTION_FAILED: Phone: ${session.user} | Error: ${error.message}`);
    
    // Fallback extraction result
    return {
      extractions: [{
        intent: "durum_guncelleme" as const,
        intent_confidence: 0.5,
        aciklama: concatenatedDescription,
        evidence_spans: ["extraction failed"],
        timing: {},
        errors: [error.message]
      }],
      overall_summary: concatenatedDescription,
      processing_notes: [`Extraction failed: ${error.message}`]
    };
  }
}

// Send extraction results to user via WhatsApp
async function sendExtractionResultsToUser(session: Session, concatenatedDescription: string, extractionResult: any): Promise<void> {
  try {
    // Message 1: Concatenated description
    await sendText(session.user, 
      `📝 *Birleştirilmiş Açıklamanız:*\n\n${concatenatedDescription}`
    );
    
    // Message 2: Overall summary if exists
    if (extractionResult.overall_summary) {
      await sendText(session.user, 
        `📊 *Genel Özet:* ${extractionResult.overall_summary}`
      );
    }
    
    // Messages 3+: Each extraction as separate message
    for (let i = 0; i < extractionResult.extractions.length; i++) {
      const extraction = extractionResult.extractions[i] as any;
      
      if (!extraction) continue;
      
      let extractionMessage = `🔍 *İş Kalemi ${i + 1}:*\n\n`;
      extractionMessage += `• *Niyet:* ${extraction.intent}\n`;
      
      if (extraction.is_kalemi_adi) {
        extractionMessage += `• *İş Kalemi:* ${extraction.is_kalemi_adi}\n`;
      }
      if (extraction.is_kalemi_kodu) {
        extractionMessage += `• *Kod:* ${extraction.is_kalemi_kodu}\n`;
      }
      if (extraction.blok) {
        extractionMessage += `• *Blok:* ${extraction.blok}\n`;
      }
      if (extraction.daire_no) {
        extractionMessage += `• *Daire:* ${extraction.daire_no}\n`;
      }
      if (extraction.kat) {
        extractionMessage += `• *Kat:* ${extraction.kat}\n`;
      }
      if (extraction.alan) {
        extractionMessage += `• *Alan:* ${extraction.alan}\n`;
      }
      if (extraction.aciklama) {
        extractionMessage += `• *Açıklama:* ${extraction.aciklama}\n`;
      }
      
      extractionMessage += `• *Güven:* %${Math.round((extraction.intent_confidence || 0) * 100)}`;
      
      if (extraction.errors && extraction.errors.length > 0) {
        extractionMessage += `\n• *Uyarılar:* ${extraction.errors.join(', ')}`;
      }
      
      await sendText(session.user, extractionMessage);
      
      // Rate limiting between messages
      if (i < extractionResult.extractions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const totalMessages = 1 + (extractionResult.overall_summary ? 1 : 0) + extractionResult.extractions.length;
    
    logger.info({
      event: 'MESSAGES_SENT_TO_USER',
      phone: session.user,
      workflowId: session.workflowId,
      messageCount: totalMessages,
      extractionsCount: extractionResult.extractions.length,
      hasSummary: !!extractionResult.overall_summary,
      timestamp: new Date().toISOString()
    }, `📤 MESSAGES_SENT_TO_USER: Phone: ${session.user} | Messages: ${totalMessages} | Extractions: ${extractionResult.extractions.length}`);
    
  } catch (error: any) {
    logger.error({
      event: 'MESSAGE_SENDING_FAILED',
      phone: session.user,
      workflowId: session.workflowId,
      error: error.message,
      timestamp: new Date().toISOString()
    }, `❌ MESSAGE_SENDING_FAILED: Phone: ${session.user} | Error: ${error.message}`);
    
    // Fallback message
    await sendText(session.user, "✅ Teşekkürler, açıklamanız alındı ve işlendi.");
  }
}

// Forward workflow data to external system
async function forwardWorkflowData(session: Session, concatenatedDescription: string, extractionResult: any, duration: number): Promise<void> {
  const payload = {
    kind: "workflow_complete",
    workflowId: session.workflowId,
    user: session.user,
    location: session.location,
    media: session.media,
    descriptions: session.descriptions,
    concatenated_description: concatenatedDescription,
    extraction_result: extractionResult,
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
}

/** ---- Description step completion ---- */
async function finalizeDescriptionStep(session: Session, triggerMessageId: string) {
  const duration = Date.now() - session.createdAt;
  
  logger.info({
    event: 'DESCRIPTION_STEP_FINALIZATION_BEGIN',
    phone: session.user,
    workflowId: session.workflowId,
    messageId: triggerMessageId,
    timestamp: new Date().toISOString()
  }, `🏁 DESCRIPTION_STEP_FINALIZATION_BEGIN: Phone: ${session.user} | Workflow: ${session.workflowId} | Message: ${triggerMessageId}`);
  
  // Step 1: Process and concatenate descriptions
  const concatenatedDescription = await processAndConcatenateDescriptions(session);
  
  // Step 2: Extract work items from text
  const extractionResult = await extractWorkItemsFromText(session, concatenatedDescription);
  
  // Step 3: Send results to user
  await sendExtractionResultsToUser(session, concatenatedDescription, extractionResult);
  
  // Step 4: Forward data to external system
  await forwardWorkflowData(session, concatenatedDescription, extractionResult, duration);
  
  // Step 5: Complete and cleanup
  logger.info({
    event: 'DESCRIPTION_STEP_COMPLETE',
    phone: session.user,
    workflowId: session.workflowId,
    messageId: triggerMessageId,
    duration,
    metrics: {
      mediaCount: session.media.length,
      descriptionsCount: session.descriptions.length,
      textDescriptions: session.descriptions.filter(d => d.type === 'text').length,
      audioDescriptions: session.descriptions.filter(d => d.type === 'audio').length,
      extractionsCount: extractionResult?.extractions?.length || 0,
      concatenatedDescriptionLength: concatenatedDescription.length
    },
    timestamp: new Date().toISOString()
  }, `✅ DESCRIPTION_STEP_COMPLETE: Phone: ${session.user} | Workflow: ${session.workflowId} | Duration: ${duration}ms | Extractions: ${extractionResult?.extractions?.length || 0}`);
  
  // Clean up session
  sessions['map'].delete(session.user);
  
  logger.debug({
    event: 'SESSION_CLEANUP',
    phone: session.user,
    workflowId: session.workflowId,
    reason: 'description_step_completed',
    timestamp: new Date().toISOString()
  }, `🗑️ SESSION_CLEANUP: Phone: ${session.user} | Workflow: ${session.workflowId} | Reason: description step completed`);
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
          logger.debug(`📊 Status update: ${st.status}`);
          seen.set(sid);
          await forwardWithRetry({ kind: "status", metadata: value.metadata, status: st } as AnyObject);
        }

        // Messages
        for (const raw of value.messages ?? []) {
          const mid = (raw as any).id as string;
          if (!mid || seen.has(mid)) continue;
          seen.set(mid);

          const msg = normalizeMessage(raw);
          const from = normalizePhone(msg.from);
          
          // DEBUG: Log phone number format for consistency checking
          logger.debug({
            event: 'PHONE_FORMAT_CHECK',
            originalFrom: msg.from,
            normalizedFrom: from,
            messageType: msg.type,
            messageId: mid,
            timestamp: new Date().toISOString()
          }, `📱 PHONE_FORMAT_CHECK: Original: ${msg.from} | Normalized: ${from} | Type: ${msg.type} | MsgId: ${mid}`);
          
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
          
          // --- RESTRUCTURED MESSAGE HANDLING ---
          
          // Handle image/video FIRST (they can create/reset sessions)
          if (msg.type === "image" || msg.type === "video") {
            const mediaId = (msg as any).media?.id || (msg as any).image?.id || (msg as any).video?.id;
            const mediaCaption = (msg as any).media?.caption || (msg as any).image?.caption || (msg as any).video?.caption;
            
            let s = sessions.get(from);
            
            // Handle mid-flow image/video
            if (s && s.step === "awaiting_description") {
              const mediaData = {
                type: msg.type as "image" | "video",
                id: mediaId,
                caption: mediaCaption
              };
              
              logger.info({
                event: 'MID_FLOW_IMAGE_DETECTED',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                mediaType: msg.type,
                currentState: s.step,
                timestamp: new Date().toISOString()
              }, `📸 MID_FLOW_IMAGE_DETECTED: Phone: ${from} | Workflow: ${s.workflowId} | State: ${s.step} | Media: ${msg.type}`);
              
              await handleMidFlowImage(from, s, mid, mediaData);
              continue;
            }
            
            // Start new workflow (create or reset session)
            const oldWorkflowId = s?.workflowId || 'none';
            const newWorkflowId = `wf_${Date.now()}_${from.slice(-4)}`;
            
            logger.info({
              event: 'WORKFLOW_START',
              phone: from,
              oldWorkflowId,
              newWorkflowId,
              messageId: mid,
              previousState: s?.step || 'none',
              reason: 'new_media',
              mediaType: msg.type,
              timestamp: new Date().toISOString()
            }, `🔄 WORKFLOW_START: Phone: ${from} | Old: ${oldWorkflowId} | New: ${newWorkflowId} | Message: ${mid} | Media: ${msg.type}`);
            
            s = sessions.new(from);
            s.workflowId = newWorkflowId;
            s.media.push({type: msg.type as "image" | "video", id: mediaId, caption: mediaCaption});
            
            // DEBUG: Verify session was created and saved
            const verifyBeforeTransition = sessions.get(from);
            logger.debug({
              event: 'SESSION_CREATED_VERIFICATION',
              phone: from,
              normalizedPhone: normalizePhone(from),
              sessionExists: !!verifyBeforeTransition,
              sessionState: verifyBeforeTransition?.step,
              sessionWorkflowId: verifyBeforeTransition?.workflowId,
              expectedWorkflowId: newWorkflowId,
              allKeys: Array.from((sessions as any).map.keys()),
              timestamp: new Date().toISOString()
            }, `📍 SESSION_CREATED_VERIFICATION: Phone: ${from} | Exists: ${!!verifyBeforeTransition} | State: ${verifyBeforeTransition?.step} | Keys: [${Array.from((sessions as any).map.keys()).join(', ')}]`);
            
            // Update session with new data
            sessions.set(from, s);
            
            transitionState(s, 'awaiting_location', `${msg.type}_received`, mid);
            
            // DEBUG: Verify session after transition
            const verifyAfterTransition = sessions.get(from);
            logger.debug({
              event: 'SESSION_AFTER_TRANSITION',
              phone: from,
              normalizedPhone: normalizePhone(from),
              sessionExists: !!verifyAfterTransition,
              sessionState: verifyAfterTransition?.step,
              sessionWorkflowId: verifyAfterTransition?.workflowId,
              hasMedia: verifyAfterTransition?.media?.length || 0,
              allKeys: Array.from((sessions as any).map.keys()),
              timestamp: new Date().toISOString()
            }, `✅ SESSION_AFTER_TRANSITION: Phone: ${from} | Exists: ${!!verifyAfterTransition} | State: ${verifyAfterTransition?.step} | Media: ${verifyAfterTransition?.media?.length || 0} | Keys: [${Array.from((sessions as any).map.keys()).join(', ')}]`);
            
            await requestLocation(from);
            continue;
          }
          
          // For all other message types, session MUST exist
          const s = sessions.get(from);
          
          // DEBUG: Log session existence and all session keys
          const allSessionKeys = Array.from((sessions as any).map.keys());
          logger.debug({
            event: 'SESSION_LOOKUP_DEBUG',
            phone: from,
            sessionExists: !!s,
            sessionState: s?.step,
            sessionWorkflowId: s?.workflowId,
            allSessionKeys: allSessionKeys,
            totalSessions: allSessionKeys.length,
            messageType: msg.type,
            messageId: mid,
            timestamp: new Date().toISOString()
          }, `🔍 SESSION_LOOKUP_DEBUG: Phone: ${from} | Exists: ${!!s} | State: ${s?.step || 'N/A'} | AllKeys: [${allSessionKeys.join(', ')}]`);
          
          if (!s) {
            logger.warn({
              event: 'NO_ACTIVE_SESSION',
              phone: from,
              messageType: msg.type,
              messageId: mid,
              allSessionKeys: allSessionKeys,
              timestamp: new Date().toISOString()
            }, `❌ NO_ACTIVE_SESSION: Phone: ${from} | Message: ${mid} | Type: ${msg.type} - No active workflow | AllKeys: [${allSessionKeys.join(', ')}]`);
            
            await sendText(from, "📸 Başlamak için görsel veya video gönderin.");
            continue;
          }
          
          logger.debug({
            event: 'SESSION_STATE_CHECK',
            phone: from,
            workflowId: s.workflowId,
            currentState: s.step,
            messageId: mid,
            messageType: msg.type,
            timestamp: new Date().toISOString()
          }, `🔍 SESSION_STATE_CHECK: Phone: ${from} | State: ${s.step} | Workflow: ${s.workflowId} | MessageType: ${msg.type}`);
          
          // Handle mid-flow button decisions
          if (s.step === "awaiting_description" && msg.type === "interactive" && (msg as any).interactive?.button_reply) {
            const buttonId = (msg as any).interactive.button_reply.id;
            
            if (buttonId === "save_new") {
              // Get the pending media that triggered this decision
              const mediaData = (s as any).pendingMedia;
              
              logger.info({
                event: 'WORKFLOW_SAVE_AND_NEW',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                mediaType: mediaData?.type,
                mediaId: mediaData?.id,
                timestamp: new Date().toISOString()
              }, `💾 WORKFLOW_SAVE_AND_NEW: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} | Media: ${mediaData?.type}`);
              
              // Finalize current workflow first
              await finalizeDescriptionStep(s, mid);
              
              // Create new workflow WITH the triggering media
              const newWorkflowId = `wf_${Date.now()}_${from.slice(-4)}`;
              const newSession = sessions.new(from);
              newSession.workflowId = newWorkflowId;
              
              // Add the image/video that triggered this decision!
              if (mediaData) {
                newSession.media.push(mediaData);
              }
              
              await sendText(from, "✅ Mevcut açıklamanız kaydedildi. Şimdi yeni görsel için konum bilgisi gerekli.");
              
              // Transition to awaiting_location and request location (not another image!)
              transitionState(newSession, 'awaiting_location', 'save_new_with_media', mid);
              await requestLocation(from);
              continue;
              
            } else if (buttonId === "continue") {
              // Remove pending media and continue with current workflow
              delete (s as any).pendingMedia;
              sessions.set(from, s);
              
              logger.info({
                event: 'WORKFLOW_CONTINUE',
                phone: from,
                workflowId: s.workflowId,
                messageId: mid,
                timestamp: new Date().toISOString()
              }, `▶️ WORKFLOW_CONTINUE: Phone: ${from} | Workflow: ${s.workflowId} | Message: ${mid} - Image ignored`);
              
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
                
                await finalizeDescriptionStep(s, mid);
                // Session is cleaned up in finalizeWorkflow, no need to transition to completed state
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
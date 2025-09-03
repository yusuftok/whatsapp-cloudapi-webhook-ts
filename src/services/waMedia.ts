import axios from "axios";
import { logger } from "../config/logger";

// Ensure environment variables are loaded
import dotenv from "dotenv";
dotenv.config();

const GVER = process.env.GRAPH_API_VERSION || "v20.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

// Validate token on startup
if (!TOKEN) {
  logger.error({
    event: 'WHATSAPP_TOKEN_MISSING',
    error: 'WHATSAPP_ACCESS_TOKEN environment variable is not set'
  }, '❌ CRITICAL: WhatsApp access token is missing! Set WHATSAPP_ACCESS_TOKEN in .env');
}

export interface WaAudioPayload { id: string; mime_type?: string }

export async function fetchMediaUrl(mediaId: string): Promise<{ url: string; mime?: string }> {
  try {
    logger.debug({
      event: 'FETCH_MEDIA_URL_START',
      mediaId,
      graphVersion: GVER
    }, `📥 Fetching media URL for: ${mediaId}`);

    const metaRes = await axios.get(`https://graph.facebook.com/${GVER}/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    logger.debug({
      event: 'FETCH_MEDIA_URL_SUCCESS',
      mediaId,
      mimeType: metaRes.data.mime_type,
      hasUrl: !!metaRes.data.url
    }, `✅ Media URL fetched successfully for: ${mediaId}`);

    return { url: metaRes.data.url as string, mime: metaRes.data.mime_type };
  } catch (error: any) {
    logger.error({
      event: 'FETCH_MEDIA_URL_FAILED',
      mediaId,
      error: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      }
    }, `❌ Failed to fetch media URL for ${mediaId}: ${error.response?.status} ${error.message}`);
    
    throw error;
  }
}

export async function downloadMediaBuffer(url: string): Promise<Buffer> {
  try {
    logger.debug({
      event: 'DOWNLOAD_MEDIA_START',
      url: url.substring(0, 100) + '...'
    }, `📥 Downloading media from URL`);

    const res = await axios.get(url, { 
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(res.data);
    
    logger.debug({
      event: 'DOWNLOAD_MEDIA_SUCCESS',
      size: buffer.length,
      contentType: res.headers['content-type']
    }, `✅ Media downloaded successfully: ${buffer.length} bytes`);

    return buffer;
  } catch (error: any) {
    logger.error({
      event: 'DOWNLOAD_MEDIA_FAILED',
      url: url.substring(0, 100) + '...',
      error: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      }
    }, `❌ Failed to download media: ${error.response?.status} ${error.message}`);
    
    throw error;
  }
}
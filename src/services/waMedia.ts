import axios from "axios";

const GVER = process.env.META_GRAPH_VERSION || "v20.0";
const TOKEN = process.env.META_WA_TOKEN!;

export interface WaAudioPayload { id: string; mime_type?: string }

export async function fetchMediaUrl(mediaId: string): Promise<{ url: string; mime?: string }> {
  const metaRes = await axios.get(`https://graph.facebook.com/${GVER}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return { url: metaRes.data.url as string, mime: metaRes.data.mime_type };
}

export async function downloadMediaBuffer(url: string): Promise<Buffer> {
  const res = await axios.get(url, { 
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer'
  });
  return Buffer.from(res.data);
}
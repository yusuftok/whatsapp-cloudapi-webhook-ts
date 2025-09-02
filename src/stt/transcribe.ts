import { openai, STT_MODEL } from "../config/openai";
import { STT_PROMPT_TR } from "../data/glossary";

export interface TranscriptionResult {
  text: string;
  segments?: { start: number; end: number; text: string }[];
}

export async function transcribeBuffer(
  audio: Buffer,
  filename = "audio.ogg",
  mime = "audio/ogg"
): Promise<TranscriptionResult> {
  // OpenAI audio.transcriptions supports Buffer via web File API shim:
  // @ts-ignore – File exists in Node 18+ via undici
  const file = new File([audio as any], filename, { type: mime });

  const model = STT_MODEL; // e.g. gpt-4o-mini-transcribe (or whisper-1)

  const res = await openai.audio.transcriptions.create({
    file,
    model,
    language: "tr",
    prompt: STT_PROMPT_TR,
    temperature: 0.2,
    response_format: "verbose_json" as any // to ask for segments if available
  } as any);

  return {
    text: (res as any).text ?? "",
    segments: (res as any).segments?.map((s: any) => ({ start: s.start, end: s.end, text: s.text }))
  };
}

/*
// İhtiyaç olursa OGG→MP3 dönüşümü:
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
ffmpeg.setFfmpegPath(ffmpegPath as string);
export async function oggToMp3(input: Buffer): Promise<Buffer> { ... }
*/
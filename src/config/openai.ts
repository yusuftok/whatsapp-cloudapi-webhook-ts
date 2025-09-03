import OpenAI from "openai";
import { logger } from "./logger";

// Validate API key on startup
if (!process.env.OPENAI_API_KEY) {
  logger.error({
    event: 'OPENAI_CONFIG_ERROR',
    error: 'OPENAI_API_KEY environment variable is not set'
  }, '❌ CRITICAL: OpenAI API key is missing! Set OPENAI_API_KEY environment variable.');
  
  process.exit(1);
} else {
  logger.info({
    event: 'OPENAI_CONFIG_LOADED',
    hasApiKey: true,
    apiKeyPrefix: process.env.OPENAI_API_KEY.substring(0, 7) + '...',
  }, '✅ OpenAI configuration loaded successfully');
}

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const STT_MODEL = process.env.OPENAI_STT_MODEL || "whisper-1";
export const LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4o-2024-08-06";

// Log model configuration
logger.info({
  event: 'OPENAI_MODELS_CONFIGURED',
  sttModel: STT_MODEL,
  llmModel: LLM_MODEL
}, `🤖 OpenAI models configured - STT: ${STT_MODEL}, LLM: ${LLM_MODEL}`);
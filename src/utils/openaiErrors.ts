import { logger } from "../config/logger";

export interface OpenAIErrorDetails {
  status?: number;
  statusText?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
    param?: string;
  };
  headers?: Record<string, any>;
  request?: {
    method?: string;
    url?: string;
    model?: string;
  };
}

/**
 * Extracts detailed error information from OpenAI API errors
 */
export function extractOpenAIError(error: any): OpenAIErrorDetails {
  const details: OpenAIErrorDetails = {};

  // Handle Axios errors (from HTTP requests)
  if (error.response) {
    details.status = error.response.status;
    details.statusText = error.response.statusText;
    details.headers = error.response.headers;
    
    // Extract OpenAI error details
    if (error.response.data?.error) {
      details.error = {
        message: error.response.data.error.message,
        type: error.response.data.error.type,
        code: error.response.data.error.code,
        param: error.response.data.error.param,
      };
    } else if (error.response.data) {
      // Fallback for non-standard error format
      details.error = {
        message: typeof error.response.data === 'string' 
          ? error.response.data 
          : JSON.stringify(error.response.data),
      };
    }
  }

  // Handle OpenAI SDK errors
  if (error.status) {
    details.status = error.status;
  }
  
  if (error.error) {
    details.error = {
      message: error.error?.message || error.message,
      type: error.error?.type || error.type,
      code: error.error?.code || error.code,
    };
  }

  // Extract request details
  if (error.config) {
    details.request = {
      method: error.config.method?.toUpperCase(),
      url: error.config.url,
    };
  }

  // If no specific error extracted, use the general error message
  if (!details.error?.message && error.message) {
    details.error = { message: error.message };
  }

  return details;
}

/**
 * Logs OpenAI error with full details
 */
export function logOpenAIError(
  context: string,
  error: any,
  additionalInfo: Record<string, any> = {}
): OpenAIErrorDetails {
  const errorDetails = extractOpenAIError(error);
  
  logger.error({
    context,
    ...additionalInfo,
    error: {
      status: errorDetails.status,
      statusText: errorDetails.statusText,
      message: errorDetails.error?.message,
      type: errorDetails.error?.type,
      code: errorDetails.error?.code,
      param: errorDetails.error?.param,
    },
    request: errorDetails.request,
    stack: error.stack,
  }, `❌ OpenAI API Error in ${context}: ${errorDetails.error?.message || error.message}`);

  return errorDetails;
}

/**
 * Creates a user-friendly error message from OpenAI error
 */
export function formatOpenAIErrorMessage(error: any): string {
  const details = extractOpenAIError(error);
  
  if (details.status === 401) {
    return "Kimlik doğrulama hatası - API anahtarı geçersiz veya eksik";
  } else if (details.status === 429) {
    return "Rate limit aşıldı - Lütfen biraz bekleyin";
  } else if (details.status === 500) {
    return "OpenAI sunucu hatası - Lütfen tekrar deneyin";
  } else if (details.status === 503) {
    return "OpenAI servisi geçici olarak kullanılamıyor";
  } else if (details.error?.message) {
    return `OpenAI hatası: ${details.error.message}`;
  } else {
    return `OpenAI servisi hatası: ${error.message || 'Bilinmeyen hata'}`;
  }
}
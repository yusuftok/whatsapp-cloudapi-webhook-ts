// src/nlp/schema.ts
export type Intent =
  | "mesai_baslangici"
  | "mesai_bitisi"
  | "is_kalemi_baslangici"
  | "is_kalemi_bitisi"
  | "sorun_bildirimi"
  | "durum_guncelleme"
  | "malzeme_talebi"
  | "bilgi_talebi";

export interface Extraction {
  intent: Intent;
  intent_confidence: number;           // 0..1
  is_kalemi_kodu?: string;             // Örn: 3.1.1.1
  is_kalemi_adi?: string;              // Örn: Şap - Daire
  is_kalemi_confidence?: number;       // 0..1
  blok?: string;                       // Örn: A, B1, C‑10
  daire_no?: string;                   // Örn: 12, 10B
  kat?: string;                        // Örn: Zemin, 3, -3
  alan?: string;                       // Örn: daire, ortak alan, sosyal tesis...
  aciklama?: string;                   // Serbest metin özet
  evidence_spans?: string[];           // Kararı tetikleyen pasajlar
  timing?: {
    tahmini_baslangic?: string;        // ISO8601 (varsa konuşmada)
    tahmini_bitis?: string;            // ISO8601
    bildirilen_saat?: string;          // ISO8601 (konuşmadan)
  };
  errors?: string[];                   // Modelin gördüğü çelişkiler/uyarılar
}

// Birden fazla iş kalemi için çıkarım sonucu
export interface MultipleExtractions {
  extractions: Extraction[];           // Her bir iş kalemi için ayrı extraction
  overall_summary?: string;            // Tüm açıklamaların genel özeti
  processing_notes?: string[];         // İşleme notları
}

// OpenAI Structured Outputs için JSON Schema (tek extraction)
export const EXTRACTION_JSON_SCHEMA = {
  name: "construction_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: [
        "mesai_baslangici","mesai_bitisi","is_kalemi_baslangici",
        "is_kalemi_bitisi","sorun_bildirimi","durum_guncelleme",
        "malzeme_talebi","bilgi_talebi"
      ] },
      intent_confidence: { type: "number", minimum: 0, maximum: 1 },
      is_kalemi_kodu: { type: ["string","null"] },
      is_kalemi_adi: { type: ["string","null"] },
      is_kalemi_confidence: { type: ["number","null"], minimum: 0, maximum: 1 },
      blok: { type: ["string","null"] },
      daire_no: { type: ["string","null"] },
      kat: { type: ["string","null"] },
      alan: { type: ["string","null"] },
      aciklama: { type: ["string","null"] },
      evidence_spans: { type: "array", items: { type: "string" } },
      timing: { type: "object", additionalProperties: false, properties: {
        tahmini_baslangic: { type: ["string","null"], description: "ISO8601" },
        tahmini_bitis: { type: ["string","null"] },
        bildirilen_saat: { type: ["string","null"] }
      }},
      errors: { type: "array", items: { type: "string" } }
    },
    required: ["intent","intent_confidence","evidence_spans"]
  }
} as const;

// Birden fazla extraction için JSON Schema
export const MULTIPLE_EXTRACTIONS_JSON_SCHEMA = {
  name: "multiple_construction_extractions",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      extractions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string", enum: [
              "mesai_baslangici","mesai_bitisi","is_kalemi_baslangici",
              "is_kalemi_bitisi","sorun_bildirimi","durum_guncelleme",
              "malzeme_talebi","bilgi_talebi"
            ] },
            intent_confidence: { type: "number", minimum: 0, maximum: 1 },
            is_kalemi_kodu: { type: ["string","null"] },
            is_kalemi_adi: { type: ["string","null"] },
            is_kalemi_confidence: { type: ["number","null"], minimum: 0, maximum: 1 },
            blok: { type: ["string","null"] },
            daire_no: { type: ["string","null"] },
            kat: { type: ["string","null"] },
            alan: { type: ["string","null"] },
            aciklama: { type: ["string","null"] },
            evidence_spans: { type: "array", items: { type: "string" } },
            timing: { type: "object", additionalProperties: false, properties: {
              tahmini_baslangic: { type: ["string","null"], description: "ISO8601" },
              tahmini_bitis: { type: ["string","null"] },
              bildirilen_saat: { type: ["string","null"] }
            }},
            errors: { type: "array", items: { type: "string" } }
          },
          required: ["intent","intent_confidence","evidence_spans"]
        }
      },
      overall_summary: { type: ["string","null"] },
      processing_notes: { type: "array", items: { type: "string" } }
    },
    required: ["extractions"]
  }
} as const;
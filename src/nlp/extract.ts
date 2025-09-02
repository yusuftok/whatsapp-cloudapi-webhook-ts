// src/nlp/extract.ts — Elektrik/Asansör örnekleri eklendi (few‑shot genişledi)
import { openai, LLM_MODEL } from "../config/openai";
import { EXTRACTION_JSON_SCHEMA, MULTIPLE_EXTRACTIONS_JSON_SCHEMA, Extraction, MultipleExtractions } from "./schema";
import { TAXONOMY } from "../data/taxonomy";

const SYSTEM = `Sen bir şantiye kayıt asistanısın. Görevlerin:\n1) Konuşmadan NIYET (intent) tespit et: mesai başlangıcı/bitisi, iş kalemi başlangıcı/bitisi, sorun bildirimi, durum güncelleme, malzeme talebi, bilgi talebi.\n2) Metinde iş kalemi geçiyorsa, verilen TAKSONOMİDEN en yakın koda ve ada eşle.\n3) Lokasyon bilgisini yakala: blok, daire, kat, alan (daire, balkon, ortak alan, sosyal tesis, otopark, hizmetli odası, teknik alan, güvenlik, sığınak ...).\n4) Kararlarını destekleyen metin parçalarını evidence_spans'ta listele.\n5) Emin olamadığın noktalarda düşük confidence ver, errors'a not düş.`;

const MULTIPLE_SYSTEM = `Sen bir şantiye kayıt asistanısın. Verilen metinde BIRDEN FAZLA İŞ KALEMI olabilir. Her biri için ayrı extraction yap:
1) Her iş kalemi için ayrı NIYET (intent) tespit et: mesai başlangıcı/bitisi, iş kalemi başlangıcı/bitisi, sorun bildirimi, durum güncelleme, malzeme talebi, bilgi talebi.
2) Her iş kalemi için TAKSONOMİDEN en yakın kodu ve adı bul.
3) Her iş kalemi için lokasyon bilgisini yakala: blok, daire, kat, alan.
4) Her extraction için kararını destekleyen metin parçalarını evidence_spans'ta listele.
5) Emin olamadığın noktalarda düşük confidence ver, errors'a not düş.
6) Tüm açıklamaların genel özetini overall_summary'ye yaz.
7) İşleme ait notlarını processing_notes'a ekle.`;

// Birden fazla iş kalemi için few-shot örnekleri
const MULTIPLE_FEW_SHOTS: Array<{user: string; assistant: MultipleExtractions}> = [
  {
    user: "A blok 12'de şap bitti, C blok 5'te seramik başladı, otopark terfi pompaları test edildi",
    assistant: {
      extractions: [
        {
          intent: "is_kalemi_bitisi",
          intent_confidence: 0.9,
          is_kalemi_kodu: "3.1.1.1",
          is_kalemi_adi: "Şap - Daire",
          is_kalemi_confidence: 0.9,
          blok: "A",
          daire_no: "12",
          alan: "daire",
          aciklama: "A Blok 12 nolu daire şap imalatı tamamlandı",
          evidence_spans: ["A blok 12", "şap bitti"],
          timing: {}
        },
        {
          intent: "is_kalemi_baslangici",
          intent_confidence: 0.88,
          is_kalemi_kodu: "3.1.3.1",
          is_kalemi_adi: "Seramik - Daire",
          is_kalemi_confidence: 0.85,
          blok: "C",
          daire_no: "5",
          alan: "daire",
          aciklama: "C Blok 5 nolu daire seramik işine başlandı",
          evidence_spans: ["C blok 5", "seramik başladı"],
          timing: {}
        },
        {
          intent: "durum_guncelleme",
          intent_confidence: 0.82,
          is_kalemi_kodu: "4.1.6",
          is_kalemi_adi: "Pis Su Tesisatı",
          is_kalemi_confidence: 0.75,
          alan: "otopark",
          aciklama: "Otopark terfi pompaları test edildi",
          evidence_spans: ["otopark terfi pompaları", "test edildi"],
          timing: {}
        }
      ],
      overall_summary: "3 farklı iş kalemi: A12 şap bitişi, C5 seramik başlangıcı, otopark pompa testi",
      processing_notes: ["3 farklı lokasyon ve iş kalemi tespit edildi"]
    }
  }
];

const FEW_SHOTS: Array<{user: string; assistant: Extraction}> = [
  {
    user: "abi a blok on iki numarada şap döktük bitti, ortak alan yarın",
    assistant: {
      intent: "is_kalemi_bitisi",
      intent_confidence: 0.9,
      is_kalemi_kodu: "3.1.1.1",
      is_kalemi_adi: "Şap - Daire",
      is_kalemi_confidence: 0.9,
      blok: "A",
      daire_no: "12",
      alan: "daire",
      aciklama: "A Blok 12 nolu daire şap imalatı tamamlandı",
      evidence_spans: ["a blok on iki", "şap", "bitti"],
      timing: {}
    }
  },
  {
    user: "b1 blokta yangın merdiveni ortak alan şap başladı",
    assistant: {
      intent: "is_kalemi_baslangici",
      intent_confidence: 0.86,
      is_kalemi_kodu: "3.1.1.4.1",
      is_kalemi_adi: "Şap - Ortak Alan (Yangın Merdiveni)",
      is_kalemi_confidence: 0.82,
      blok: "B1",
      alan: "ortak alan",
      aciklama: "B1 blokta yangın merdiveni şapına başlandı",
      evidence_spans: ["b1 blok", "yangın merdiveni", "şap", "başladı"],
      timing: {}
    }
  },
  {
    user: "c on kat holünde seramikte sorun var, üç kasa eksik malzeme lazım",
    assistant: {
      intent: "sorun_bildirimi",
      intent_confidence: 0.84,
      is_kalemi_kodu: "3.1.3.1",
      is_kalemi_adi: "Seramik - Daire",
      is_kalemi_confidence: 0.55,
      blok: "C",
      alan: "ortak alan",
      aciklama: "Seramikte sorun ve malzeme eksikliği",
      evidence_spans: ["kat holü", "seramik", "sorun", "eksik malzeme"],
      timing: {},
      errors: ["Kat holü ortak alan – tam alt kod belirsiz"]
    }
  },
  {
    user: "dört eksi üçte pis su terfi pompalarını bağladık devreye alma yarın",
    assistant: {
      intent: "durum_guncelleme",
      intent_confidence: 0.8,
      is_kalemi_kodu: "4.1.6",
      is_kalemi_adi: "Pis Su Tesisatı",
      is_kalemi_confidence: 0.7,
      kat: "-3",
      aciklama: "-3. bodrum pis su terfi pompa bağlantıları yapıldı",
      evidence_spans: ["eksi üç", "pis su terfi pompaları", "bağladık"],
      timing: {}
    }
  },
  {
    user: "usta, c-10 daire kombi asıldı ama bağlantılar kaldı",
    assistant: {
      intent: "durum_guncelleme",
      intent_confidence: 0.82,
      is_kalemi_kodu: "4.2.1",
      is_kalemi_adi: "Cihaz ve Montajı (Kombi, Bağlantılar)",
      is_kalemi_confidence: 0.78,
      blok: "C",
      daire_no: "10",
      alan: "daire",
      aciklama: "Kombi montajı yapıldı, alt bağlantılar bekliyor",
      evidence_spans: ["kombi asıldı", "bağlantılar kaldı"],
      timing: {}
    }
  },
  {
    user: "a blok sığınakta hidrofor tamam, boyler yarına kaldı",
    assistant: {
      intent: "durum_guncelleme",
      intent_confidence: 0.83,
      is_kalemi_kodu: "4.1.4",
      is_kalemi_adi: "Cihaz ve Montajı (Hidrofor/Boyler)",
      is_kalemi_confidence: 0.75,
      blok: "A",
      alan: "sığınak",
      aciklama: "Hidrofor bitti, boyler yarın",
      evidence_spans: ["hidrofor tamam", "boyler yarına"],
      timing: {}
    }
  },
  {
    user: "kat hollerinde acil aydınlatma ve exitler tamam, ADP devreye yarın",
    assistant: {
      intent: "durum_guncelleme",
      intent_confidence: 0.85,
      is_kalemi_kodu: "5.4.6",
      is_kalemi_adi: "Acil Aydınlatma ve Yönlendirme (Emergency/Exit)",
      is_kalemi_confidence: 0.8,
      alan: "ortak alan",
      aciklama: "Acil aydınlatma ve yönlendirme tamamlandı, ADP devreye alma yarın",
      evidence_spans: ["acil aydınlatma", "exitler", "ADP"],
      timing: {}
    }
  },
  {
    user: "asansörde kat kapıları geldi, montaja başlıyoruz pazartesi hız regülatör testi",
    assistant: {
      intent: "is_kalemi_baslangici",
      intent_confidence: 0.83,
      is_kalemi_kodu: "6.6.2",
      is_kalemi_adi: "Kat Kapıları ve Kasaları",
      is_kalemi_confidence: 0.8,
      aciklama: "Kat kapıları montaj başlangıcı, hız regülatör testi planlandı",
      evidence_spans: ["kat kapıları", "montaja başlıyoruz", "hız regülatör testi"],
      timing: {}
    }
  }
];

export async function extractFromText(transcript: string): Promise<Extraction> {
  const messages: any[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Taksonomi JSON'u:\n${JSON.stringify(TAXONOMY).slice(0, 4000)}\n\nGörev: Aşağıdaki metinden yapılandırılmış çıkarım üret.`
    }
  ];

  for (const ex of FEW_SHOTS) {
    messages.push({ role: "user", content: ex.user });
    messages.push({ role: "assistant", content: JSON.stringify(ex.assistant) });
  }
  messages.push({ role: "user", content: transcript });

  const resp = await openai.responses.create({
    model: LLM_MODEL,
    reasoning: { effort: "low" },
    input: messages,
    temperature: 0.2,
    top_p: 0.95,
    max_output_tokens: 600,
    response_format: { type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA }
  } as any);

  const toolOut = (resp as any).output?.[0]?.content?.[0]?.text
    ?? (resp as any).output_text
    ?? JSON.stringify((resp as any), null, 2);

  let parsed: Extraction;
  try { parsed = JSON.parse(toolOut); } catch { throw new Error("LLM JSON parse failed") }
  return parsed;
}

// Birden fazla iş kalemi için extraction fonksiyonu
export async function extractMultipleFromText(transcript: string): Promise<MultipleExtractions> {
  const messages: any[] = [
    { role: "system", content: MULTIPLE_SYSTEM },
    {
      role: "user",
      content: `Taksonomi JSON'u:\n${JSON.stringify(TAXONOMY).slice(0, 4000)}\n\nGörev: Aşağıdaki metinden birden fazla iş kalemi için yapılandırılmış çıkarım üret.`
    }
  ];

  for (const ex of MULTIPLE_FEW_SHOTS) {
    messages.push({ role: "user", content: ex.user });
    messages.push({ role: "assistant", content: JSON.stringify(ex.assistant) });
  }
  messages.push({ role: "user", content: transcript });

  const resp = await openai.responses.create({
    model: LLM_MODEL,
    reasoning: { effort: "medium" },
    input: messages,
    temperature: 0.2,
    top_p: 0.95,
    max_output_tokens: 1200,
    response_format: { type: "json_schema", json_schema: MULTIPLE_EXTRACTIONS_JSON_SCHEMA }
  } as any);

  const toolOut = (resp as any).output?.[0]?.content?.[0]?.text
    ?? (resp as any).output_text
    ?? JSON.stringify((resp as any), null, 2);

  let parsed: MultipleExtractions;
  try { parsed = JSON.parse(toolOut); } catch { throw new Error("LLM JSON parse failed for multiple extractions") }
  return parsed;
}
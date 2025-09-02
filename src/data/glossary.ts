export const STT_PROMPT_TR = `
Türkçe inşaat terimleri, blok/daire/kod adlandırmaları, marka/model isimleri doğru yazılsın.
Örnekler: A Blok, B1, C-10, daire 12, 3. bodrum, kat holü, yangın merdiveni.
İnce işler: şap, kaba sıva, saten alçı, alçıpan, tuğla duvar, XPS, sürme izolasyon,
seramik kaplama, mermer imalatı, duvar kağıdı, brüt beton astarı, boya işleri,
sürgülü kapı, geçiş çıtası, dilatasyon, tavan karkas, alçıpan tavan, tavan sıva.
Mekanik: vitrifiye, armatür, hidrofor, drenaj pompası, pis su pompası, boyler,
sirkülasyon pompası, genleşme deposu, arıtma, su yumuşatma, süzgeç, PPR boru,
pis su tesisatı, temiz su tesisatı, sayaç, rögar, geri akış önleyici, terfi pompası.
Elektrik (kuvvetli): ADP, KDP, kompanzasyon, MCCB, MCB, kaçak akım, şalter,
sigorta, kontaktör, kablo tavası, galvaniz boru, klemens, etiketleme.
Aydınlatma: armatür, downlight, projektör, acil aydınlatma, exit yönlendirme.
Zayıf akım: adresli yangın algılama, dedektör, buton, siren, flaşör, loop,
CCTV dome/bullet, NVR, PoE, interkom/diafon, patch panel, keystone, Cat6,
BMS entegrasyonu, PA-VA anons, uydu/IPTV.
Güç sürekliliği: jeneratör, ATS, UPS.
Asansör: kuyu, pit, tampon, kılavuz ray, karşı ağırlık, kabin, butonyer,
hız regülatörü, paraşüt sistemi, kabin/kat kapısı, flat cable, kurtarma,
UPS, makine daireli/daire siz (MR/ MRL).
Lokasyon/alan: daire, balkon, hizmetli odası, ortak alan, otopark, sosyal tesis,
teknik alan, güvenlik, sığınak, şaft, cephe, çatı.
Eylemler: başladı, bitti, devam ediyor, malzeme lazım, sorun/arıza, kontrol edildi,
teslim, keşif, ölçüm, rölöve, söküm, montaj, imalat, deneme devreye alma, prova.
Kısaltmalar/yanlış telaffuz: isp→ISP, ppr→PPR, şap→sap, alçıpan→alcipan, vitrifiye→vitrifiy,
hidrofor→hidrafor, parafudr→surge arrester, ups→UPS, adp→ADP, kdp→KDP.
`;

export const SYNONYMS: Array<[string, ...string[]]> = [
  ["şap", "sap"],
  ["alçıpan", "alcipan"],
  ["XPS", "ekspies"],
  ["boyler", "boiler"],
  ["genleşme deposu", "genlesme deposu"],
  ["sirkülasyon pompası", "resirkülasyon pompası", "dolaşım pompası"],
  ["vitrifiye", "vitrifiy"],
  ["pis su", "atıksu"],
  ["temiz su", "içme suyu"],
  ["yangın merdiveni", "yangın mer."],
  ["parafudr", "surge arrester"],
  ["UPS", "kesintisiz güç kaynağı"],
  ["ADP", "ana dağıtım panosu"],
  ["KDP", "kat dağıtım panosu"],
  ["butonyer", "buton paneli"],
];
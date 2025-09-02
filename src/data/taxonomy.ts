// Proje iş kalemi taksonomisi — Elektrik (5.x) ve Asansör (6.x) alt kırılımları entegre.

export const TAXONOMY = {
    "1": { kod: "1", ad: "Zemin İyileştirme / Fore Kazık / İksa" },
    "2": { kod: "2", ad: "Kaba Yapı İmalatları" },
    "3": {
      kod: "3",
      ad: "İnce İşler",
      alt: {
        "3.1": {
          kod: "3.1",
          ad: "Döşeme Kaplama İşleri",
          alt: {
            "3.1.1": {
              kod: "3.1.1",
              ad: "Şap İmalatı",
              alt: {
                "3.1.1.1": { kod: "3.1.1.1", ad: "Şap - Daire" },
                "3.1.1.2": { kod: "3.1.1.2", ad: "Şap - Balkon (Daire)" },
                "3.1.1.3": { kod: "3.1.1.3", ad: "Şap - Hizmetli Odası" },
                "3.1.1.4": {
                  kod: "3.1.1.4",
                  ad: "Şap - Ortak Alan",
                  alt: {
                    "3.1.1.4.1": { kod: "3.1.1.4.1", ad: "Şap - Ortak Alan (Yangın Merdiveni)" },
                    "3.1.1.4.2": { kod: "3.1.1.4.2", ad: "Şap - Ortak Alan (Kat Holü/Blok)" }
                  }
                },
                "3.1.1.5": { kod: "3.1.1.5", ad: "Şap - Otopark" }
              }
            },
            "3.1.2": {
              kod: "3.1.2",
              ad: "Yalıtım İşleri",
              alt: {
                "3.1.2.1": { kod: "3.1.2.1", ad: "Sürme İzolasyon" },
                "3.1.2.2": {
                  kod: "3.1.2.2",
                  ad: "XPS",
                  alt: {
                    "3.1.2.2.1": { kod: "3.1.2.2.1", ad: "XPS - Bina Cephe" },
                    "3.1.2.2.2": { kod: "3.1.2.2.2", ad: "XPS - 3. Bodrum Tavanı" },
                    "3.1.2.2.3": { kod: "3.1.2.2.3", ad: "XPS - 4. Bodrum Tavanı" },
                    "3.1.2.3": { kod: "3.1.2.3", ad: "Balkon Zemin Yalıtımı" }
                  }
                }
              }
            },
            "3.1.3": {
              kod: "3.1.3",
              ad: "Döşeme Seramik Kaplama",
              alt: {
                "3.1.3.1": { kod: "3.1.3.1", ad: "Seramik - Daire" },
                "3.1.3.2": { kod: "3.1.3.2", ad: "Seramik - Sosyal Tesis" },
                "3.1.3.3": { kod: "3.1.3.3", ad: "Seramik - Depolar" },
                "3.1.3.4": { kod: "3.1.3.4", ad: "Seramik - Hizmetli Odası" },
                "3.1.3.5": { kod: "3.1.3.5", ad: "Seramik - Hidrofor Dairesi" },
                "3.1.3.6": { kod: "3.1.3.6", ad: "Seramik - Teknik Alan (C/D)" }
              }
            },
            "3.1.4": { kod: "3.1.4", ad: "PVC Kaplama - Sosyal Tesis" },
            "3.1.5": { kod: "3.1.5", ad: "Yivli Beton Uygulaması - Otopark" },
            "3.1.6": {
              kod: "3.1.6",
              ad: "Mermer İmalatı",
              alt: {
                "3.1.6.1": { kod: "3.1.6.1", ad: "Mermer - Daire" },
                "3.1.6.2": { kod: "3.1.6.2", ad: "Mermer - Ortak Alan" }
              }
            }
          }
        },
        "3.2": { kod: "3.2", ad: "Süpürgelik İşleri" },
        "3.3": {
          kod: "3.3",
          ad: "Duvar Kaplama İşleri",
          alt: {
            "3.3.1": {
              kod: "3.3.1",
              ad: "Sıva İşleri",
              alt: {
                "3.3.1.1": { kod: "3.3.1.1", ad: "Çimento Esaslı Sıva (Daire/Otopark/Sosyal Tesis/Teknik Alan/Ortak Alan)" },
                "3.3.1.2": { kod: "3.3.1.2", ad: "Alçı Sıva (Kaba/Saten)" },
                "3.3.1.3": { kod: "3.3.1.3", ad: "Köşe Çıtası İmalatı" }
              }
            },
            "3.3.2": { kod: "3.3.2", ad: "Brüt Beton Astarı (Daire/Ortak Alan)" },
            "3.3.3": { kod: "3.3.3", ad: "Seramik Duvar Kaplaması (Daire/Hidrofor)" },
            "3.3.4": { kod: "3.3.4", ad: "Duvar Kağıdı (Daire/Sosyal Tesis)" },
            "3.3.5": { kod: "3.3.5", ad: "Sürgülü Kapı İmalatı (Profil/Alçıpan)" },
            "3.3.6": { kod: "3.3.6", ad: "Boya İşleri (Daire/Ortak Alan/Hizmetli/Sosyal/Otopark)" },
            "3.3.7": { kod: "3.3.7", ad: "Duvar Mermer Kaplama (Daire İçi/Ortak Alan)" }
          }
        },
        "3.4": { kod: "3.4", ad: "Tavan İşleri (Karkas/Alçıpan/Sıva)" },
        "3.5": { kod: "3.5", ad: "Diğer Aksam İşleri (Geçiş Çıtası/Dilatasyon)" },
        "3.6": { kod: "3.6", ad: "Duvar İşleri (Tuğla/Alçıpan)" },
        "3.7": { kod: "3.7", ad: "Cephe İşleri" },
        "3.8": { kod: "3.8", ad: "Çatı İşleri" },
        "3.9": { kod: "3.9", ad: "İlave İşler" }
      }
    },
    "4": {
      kod: "4",
      ad: "Mekanik Tesisat",
      alt: {
        "4.1": {
          kod: "4.1",
          ad: "Sıhhi Tesisat",
          alt: {
            "4.1.1": { kod: "4.1.1", ad: "Vitrifiye & Armatür Montajı (Daire/Hizmetli/Sosyal/Sığınak)" },
            "4.1.2": { kod: "4.1.2", ad: "Aksesuar Montajı (Daire/Hizmetli/Sosyal/Sığınak)" },
            "4.1.3": { kod: "4.1.3", ad: "Süzgeç ve Montajı (Banyo/Balkon/Çatı/Tesis)" },
            "4.1.4": { kod: "4.1.4", ad: "Cihaz ve Montajı (Hidrofor/Pis Su Pompası/Drenaj/Boyler/Sirkülasyon/Genleşme/Arıtma/Tesisat Armatürü)" },
            "4.1.6": { kod: "4.1.6", ad: "Pis Su Tesisatı (Daire/Hizmetli/Kolon/Yağmur/Bodrum Hatları/Rögar/Terfi)" },
            "4.1.7": { kod: "4.1.7", ad: "Temiz Su Tesisatı (Daire/Ortak Alan/Hizmetli/Sosyal/Güvenlik)" },
            "4.1.8": { kod: "4.1.8", ad: "İzolasyon (Daire/Şaft/Sosyal/Bina Dağıtım/Hizmetli)" }
          }
        },
        "4.2": {
          kod: "4.2",
          ad: "Isıtma Tesisatı",
          alt: {
            "4.2.1": { kod: "4.2.1", ad: "Cihaz ve Montajı (Kombi, Bağlantılar)" },
            "4.2.1.5": { kod: "4.2.1.5", ad: "Sirkülasyon Pompası (ISP1‑2 Boyler / ISP3‑4 Yerden Isıtma / ISP5‑6 Nem Alma)" },
            "4.2.2": { kod: "4.2.2", ad: "Isıtma Tesisatı Borulama (PPR – Daire vb.)" }
          }
        }
      }
    },
    "5": {
      kod: "5",
      ad: "Elektrik",
      alt: {
        "5.1": {
          kod: "5.1",
          ad: "Enerji Girişi ve Ana Dağıtım",
          alt: {
            "5.1.1": { kod: "5.1.1", ad: "Enerji Girişi / Sayaç Odası (ADM, ölçü hücresi)" },
            "5.1.2": { kod: "5.1.2", ad: "Ana Dağıtım Panosu (ADP) Montajı" },
            "5.1.3": { kod: "5.1.3", ad: "Kompanzasyon Panosu ve Ayarı" },
            "5.1.4": { kod: "5.1.4", ad: "Kat/Blok Dağıtım Panoları (KDP/BDP)" }
          }
        },
        "5.2": {
          kod: "5.2",
          ad: "Kablo Tavası ve Askı Sistemleri",
          alt: {
            "5.2.1": { kod: "5.2.1", ad: "Ana Güzergâh (şaft/koridor)" },
            "5.2.2": { kod: "5.2.2", ad: "Otopark ve Teknik Alanlar" },
            "5.2.3": { kod: "5.2.3", ad: "Düşey Şaft / Asansör Kuyu Kenarı" }
          }
        },
        "5.3": {
          kod: "5.3",
          ad: "Borulama ve Kablo Çekimi",
          alt: {
            "5.3.1": { kod: "5.3.1", ad: "Borulama (PVC/galvaniz/fleks)" },
            "5.3.2": { kod: "5.3.2", ad: "Kuvvetli Akım Kablolaması" },
            "5.3.3": { kod: "5.3.3", ad: "Aydınlatma Devre Kablolaması" },
            "5.3.4": { kod: "5.3.4", ad: "Etiketleme / Numaralandırma / Klemensleme" }
          }
        },
        "5.4": {
          kod: "5.4",
          ad: "Aydınlatma",
          alt: {
            "5.4.1": { kod: "5.4.1", ad: "Aydınlatma - Daire" },
            "5.4.2": { kod: "5.4.2", ad: "Aydınlatma - Ortak Alan (kat holü/yangın merdiveni)" },
            "5.4.3": { kod: "5.4.3", ad: "Aydınlatma - Otopark" },
            "5.4.4": { kod: "5.4.4", ad: "Aydınlatma - Sosyal Tesis" },
            "5.4.5": { kod: "5.4.5", ad: "Aydınlatma - Teknik Alan/Şaft" },
            "5.4.6": { kod: "5.4.6", ad: "Acil Aydınlatma ve Yönlendirme (Emergency/Exit)" }
          }
        },
        "5.5": {
          kod: "5.5",
          ad: "Priz ve Küçük Güç Uçları",
          alt: {
            "5.5.1": { kod: "5.5.1", ad: "Priz - Daire" },
            "5.5.2": { kod: "5.5.2", ad: "Priz - Ortak Alan" },
            "5.5.3": { kod: "5.5.3", ad: "Priz - Otopark/Teknik Alan" }
          }
        },
        "5.6": {
          kod: "5.6",
          ad: "Topraklama, Eş Potansiyel ve Parafudr",
          alt: {
            "5.6.1": { kod: "5.6.1", ad: "Topraklama Ring/Barası" },
            "5.6.2": { kod: "5.6.2", ad: "Eş Potansiyel Barası (EPB)" },
            "5.6.3": { kod: "5.6.3", ad: "Paratoner/Parafudr Sistemleri" }
          }
        },
        "5.7": {
          kod: "5.7",
          ad: "Zayıf Akım Sistemleri",
          alt: {
            "5.7.1": { kod: "5.7.1", ad: "Yangın Algılama ve Alarm (dedektör/buton/siren/santral)" },
            "5.7.2": { kod: "5.7.2", ad: "CCTV (kameralar, NVR)" },
            "5.7.3": { kod: "5.7.3", ad: "Kartlı Geçiş/Turnike" },
            "5.7.4": { kod: "5.7.4", ad: "İnterkom/Diafon" },
            "5.7.5": { kod: "5.7.5", ad: "Data/Telefon (Cat6, patch panel)" },
            "5.7.6": { kod: "5.7.6", ad: "Uydu/IPTV" },
            "5.7.7": { kod: "5.7.7", ad: "Anons/PA-VA" },
            "5.7.8": { kod: "5.7.8", ad: "Bina Otomasyon (BMS) Entegrasyonu" }
          }
        },
        "5.8": {
          kod: "5.8",
          ad: "Güç Sürekliliği ve Entegrasyon",
          alt: {
            "5.8.1": { kod: "5.8.1", ad: "Jeneratör Kablolaması ve ATS" },
            "5.8.2": { kod: "5.8.2", ad: "UPS Kurulum ve Dağıtım" }
          }
        },
        "5.9": {
          kod: "5.9",
          ad: "Test – Devreye Alma – Dokümantasyon",
          alt: {
            "5.9.1": { kod: "5.9.1", ad: "Yalıtım (Megger) ve Süreklilik Testleri" },
            "5.9.2": { kod: "5.9.2", ad: "Topraklama Ölçümü / Parafudr Testi" },
            "5.9.3": { kod: "5.9.3", ad: "Lux ve Acil Aydınlatma Testleri" },
            "5.9.4": { kod: "5.9.4", ad: "Devreye Alma, Etiketleme, As‑Built" }
          }
        }
      }
    },
    "6": {
      kod: "6",
      ad: "Asansör",
      alt: {
        "6.1": {
          kod: "6.1",
          ad: "Kuyu ve Hazırlık İşleri (makine daireli/daire siz ops.)",
          alt: {
            "6.1.1": { kod: "6.1.1", ad: "Kuyu Ölçüm/Markaj – Ankraj Plakaları" },
            "6.1.2": { kod: "6.1.2", ad: "Pit Donanımları (tampon, çukur, drenaj)" },
            "6.1.3": { kod: "6.1.3", ad: "Kuyu Merdiveni/Platform/Emniyet Elemanları" }
          }
        },
        "6.2": {
          kod: "6.2",
          ad: "Ray ve Karşı Ağırlık Montajı",
          alt: {
            "6.2.1": { kod: "6.2.1", ad: "Kılavuz Raylar" },
            "6.2.2": { kod: "6.2.2", ad: "Karşı Ağırlık ve Kızaklar" }
          }
        },
        "6.3": {
          kod: "6.3",
          ad: "Makine ve Tahrik Grubu",
          alt: {
            "6.3.1": { kod: "6.3.1", ad: "Dişli/Dișlisiz Motor ve Makara (MRL/MD)" },
            "6.3.2": { kod: "6.3.2", ad: "Makine Dairesi Ekipmanları (varsa)" }
          }
        },
        "6.4": {
          kod: "6.4",
          ad: "Kumanda ve Kontrol",
          alt: {
            "6.4.1": { kod: "6.4.1", ad: "Kumanda Panosu (kontrol kartı, sürücü)" },
            "6.4.2": { kod: "6.4.2", ad: "Hız Regülatörü, Sınır Şalterleri" }
          }
        },
        "6.5": {
          kod: "6.5",
          ad: "Kabin ve İç Donanımlar",
          alt: {
            "6.5.1": { kod: "6.5.1", ad: "Kabin Şasesi / Üst Donanım" },
            "6.5.2": { kod: "6.5.2", ad: "Kabin İçi Kaplama, Tavan, Aydınlatma" },
            "6.5.3": { kod: "6.5.3", ad: "Butonyer, Display, Acil Telefon/Interkom" }
          }
        },
        "6.6": {
          kod: "6.6",
          ad: "Kapılar",
          alt: {
            "6.6.1": { kod: "6.6.1", ad: "Kabin Kapısı" },
            "6.6.2": { kod: "6.6.2", ad: "Kat Kapıları ve Kasaları" }
          }
        },
        "6.7": {
          kod: "6.7",
          ad: "Tesisat ve Kablolama",
          alt: {
            "6.7.1": { kod: "6.7.1", ad: "Hareketli Kablo/Flat Cable (sepet)" },
            "6.7.2": { kod: "6.7.2", ad: "Kat Butonyerleri Kablajı" }
          }
        },
        "6.8": {
          kod: "6.8",
          ad: "Güvenlik ve Kurtarma Sistemleri",
          alt: {
            "6.8.1": { kod: "6.8.1", ad: "Emniyet Tertibatı (paraşüt sistemi, tamponlar)" },
            "6.8.2": { kod: "6.8.2", ad: "Acil Kurtarma / UPS Entegrasyonu" },
            "6.8.3": { kod: "6.8.3", ad: "Yangın Senaryosu Entegrasyonu" }
          }
        },
        "6.9": {
          kod: "6.9",
          ad: "Test, Devreye Alma ve Ruhsat",
          alt: {
            "6.9.1": { kod: "6.9.1", ad: "Yük Testi ve Fonksiyon Testleri" },
            "6.9.2": { kod: "6.9.2", ad: "Hız Regülatörü/Paraşüt Testleri" },
            "6.9.3": { kod: "6.9.3", ad: "Bağımsız Muayene (TSE/akredite) ve Kabul" }
          }
        }
      }
    },
    "7": { kod: "7", ad: "Atıksu + Yağmursuyu + İçmesuyu + Telekom Hattı" },
    "8": { kod: "8", ad: "Çevre Düzenleme ve Peyzaj" },
    "9": { kod: "9", ad: "Müteferrik İşler" },
    "9A": { kod: "9A", ad: "Eksik ve Problemli İşler" }
  };
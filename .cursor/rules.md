# WhatsApp Cloud API Webhook - Development Rules

## 🚨 KRİTİK GÜVENLİK KURALLARI

### Process Kill Komutları
**ASLA genel pkill kullanmayın!**

#### ❌ YASAKLANAN:
- `pkill -f "node.*server.js"`
- `pkill -f "node"`
- `killall node`
- Genel pattern'lerle process kill

#### ✅ İZİN VERİLEN:
- `lsof -ti:3100 | xargs kill -9` (sadece belirli port)
- `kill -9 <PID>` (PID ile kill)
- `lsof -i:3100` (process bilgisi görüntüleme)

### Güvenlik Nedeni
Genel pkill komutları diğer projeleri, production server'ları ve team members'ın çalışan projelerini kill edebilir!

## 🛠️ Development Rules

### Port Management
- Sadece port 3100 kullan (PORT=3100)
- Diğer portları kontrol et
- Port conflict'leri önle

### Environment
- .env dosyası gitignore'da kalmalı
- .env.example template olarak kullan
- Hassas bilgileri commit etme

### Logging
- Pretty format + Türkiye timezone
- Level isimleri (INFO, DEBUG vs.)
- Comprehensive logging

## 📁 Project Structure
- `src/` - TypeScript source code
- `dist/` - Compiled JavaScript output
- `.env` - Environment variables (gitignore)
- `.env.example` - Template file

## 🔄 Server Restart Sequence
1. `lsof -i:3100` (PID bul)
2. `kill -9 <PID>` (process kill)
3. `npm start` (server başlat)

## 🚀 Build & Run Commands
```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start
```

## ⚠️ Warning
Bu kurallar güvenlik için kritik öneme sahiptir!

## �� Debug Commands
```bash
# Port kontrol
lsof -i:3100

# Process kill (güvenli)
lsof -ti:3100 | xargs kill -9

# Health check
curl http://localhost:3100/healthz
```

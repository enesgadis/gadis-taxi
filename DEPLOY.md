# Deploys — bilgisayar kapaliyken calismasi icin

Repo: https://github.com/enesgadis/gadis-taxi (main)

## 1) Neon (Postgres) — ücretsiz
1. https://neon.tech → GitHub ile giriş
2. New Project (region: Frankfurt)
3. **Connection string** (postgresql://...) kopyala → `DATABASE_URL` olarak kullanılacak

## 2) Render (Rails backend)
1. https://dashboard.render.com → New → **Web Service** → GitHub repo `gadis-taxi` izin ver
2. Ayarlar:
   - **Root Directory:** `backend`
   - **Runtime:** Ruby (veya Dockerfile kullanılıyor; ama Web Service ayarları şöyle olsun):
   - **Build Command:** `bundle install && bundle exec rake db:prepare`
   - **Start Command:** `bundle exec puma -b tcp://0.0.0.0:$PORT`
     - (Veya: `bundle exec rails server -b 0.0.0.0 -p $PORT`)
3. **Environment Variables:**
   - `DATABASE_URL` → Neon connection string
   - `TELEGRAM_BOT_TOKEN` → backend/.env içindeki değer
   - `GEMINI_API_KEY` → backend/.env içindeki değer
   - `FRONTEND_URL` → Vercel URL'i (adım 3 sonrası)
   - `RAILS_MASTER_KEY` → `backend/config/master.key` dosyasındaki satır
   - `RAILS_ENV` → `production`
   - `WEB_CONCURRENCY` → `1`
4. Deploy bitince **Render shell/Console**: `bundle exec rails db:seed` (şoför/yolcu örnek kayıtlar ve test verisi)

## 3) Vercel (Next.js frontend)
1. https://vercel.com → GitHub girişi → Add New Project → repo seç → **Root Directory:** `frontend`
2. Framework Preview otomatik tanır. Environment Variables:
   - `NEXT_PUBLIC_API_URL` → https://<render-servisi>.onrender.com
   - `NEXT_PUBLIC_FRONTEND_URL` → https://<vercel-proje>.vercel.app
   - `NEXT_PUBLIC_TILE_URL` → boş kalabilir (OSM default)
3. Deploy sonrası URL'i kopyala → Render'a `FRONTEND_URL` olarak tekrar gir + **Manual Deploy**

## 4) Telegram webhook'unu Render'a çevir
```
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<render-servisi>.onrender.com/telegram/webhook"
```
(önce: deleteWebhook gerekmiyor; setWebhook yeterli)

WhatsApp webhook (Meta dashboard) → Callback URL'i Render adresine güncelle (`/webhooks/receive`).

## Notlar
- RAILS_MASTER_KEY backend/config/master.key içeriği (tek satır, tırnaksız)
- CORS zaten `origins "*"` → Vercel domain'inden serbest
- ActionCable (WebSocket) Render'da düz çalışır. Frontendde live çalışması için `/live` URL'inin
  backend'i gösterecek şekilde güncellenmesi gerekebilir (`frontend/src/lib/live.ts`)

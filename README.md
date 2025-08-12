# Crypto Momentum Dashboard

Next.js 14 + Tailwind dashboard for real-time Binance momentum data stored in Postgres (Neon).

## Requirements
- Node.js 22.x
- Postgres with tables: `ticks`, `signals` and view `latest_ticks`

## Setup
```bash
npm i
cp .env.example .env
# edit DATABASE_URL, REFRESH_MS, SYMBOLS
npm run dev
```
Visit http://localhost:3000

## API
- `GET /api/ticks/latest` — latest row per symbol from `latest_ticks`
- `GET /api/signals/recent` — most recent signal per symbol within last hour
- `GET /api/ticks/[symbol]` — returns `{ symbol, roc15m }` computed from last ~20min ticks

## Deploy (Render)
- Environment: `DATABASE_URL`
- Build: `npm run build`
- Start: `npm run start`
- Node: `22.x` (set in package.json)
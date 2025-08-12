### Data assumptions
- `latest_ticks` view exists (created in DB). It returns one latest row per symbol with: symbol, ts, close, roc1m, roc5m, vol, vol_avg, book_imb.
- `signals` table contains momentum alerts.
- `ticks` table stores 1-minute closed bars per symbol.

### Auto-refresh
- The app fetches `/api/ticks/latest` and `/api/signals/recent` every `REFRESH_MS` (default 5000ms).
- 15m ROC is fetched per symbol from `/api/ticks/[symbol]` and also auto-refreshes.

### Styling
- Tailwind with dark theme colors (see `tailwind.config.js`).

### Deploy to Render
- Set env: `DATABASE_URL`, `NEXT_PUBLIC_SYMBOLS` (optional), `NEXT_PUBLIC_REFRESH_MS` (optional)
- Build command: `npm run build`
- Start command: `npm run start`
- Add Node version pin via `"engines": { "node": "22.x" }` in package.json (already present).
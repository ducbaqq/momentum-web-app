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

## Development

### Temporary Files
All temporary files for debugging, testing, and experimentation should be created in the `./temp/` folder. This folder is automatically ignored by git.

**Examples:**
- Debug scripts: `temp/debug-database.js`
- Test files: `temp/test-new-feature.js`
- One-off analysis: `temp/analyze-market-data.js`

**Note:** The `temp/` folder is gitignored, so these files won't be committed to version control.

### ⚠️ IMPORTANT: Clean Up Debug Scripts
**DELETE DEBUG/TEST SCRIPTS AFTER VERIFYING YOUR CHANGES**

When you create Node.js scripts for testing/debugging:
1. Create the script in the `temp/` folder
2. Test and verify your hypothesis
3. **IMMEDIATELY DELETE** the script once testing is complete
4. Only keep scripts that provide ongoing value (rare)

**Why?** These scripts accumulate quickly and clutter the workspace. Most are one-time use and become obsolete once the issue is fixed.

**Reminder:** If you see a bunch of old debug scripts, delete them!

## API
- `GET /api/ticks/latest` — latest row per symbol from `latest_ticks`
- `GET /api/signals/recent` — most recent signal per symbol within last hour
- `GET /api/ticks/[symbol]` — returns `{ symbol, roc15m }` computed from last ~20min ticks

## Deploy (Render)
- Environment: `DATABASE_URL`
- Build: `npm run build`
- Start: `npm run start`
- Node: `22.x` (set in package.json)
// db.ts - Database access for web app (read-only)
import pg from 'pg';
import { config, log } from './config.js';

const { Pool } = pg;

/* =========================
   Types
   ========================= */
export interface DbTick {
  symbol: string;
  ts: string | Date;
  close: number;
  roc1m: number;
  roc5m: number;
  vol: number;
  vol_avg: number;
  book_imb: number;
}

export interface DbSignal {
  ts: string | Date;
  symbol: string;
  close: number;
  roc1m: number;
  roc5m: number;
  vol: number;
  vol_avg: number;
  book_imb: number;
}

export interface InitialData {
  ticks: DbTick[];
  signals: DbSignal[];
}

export interface LiveTick {
  symbol: string;
  ts: string;
  close: number;
  roc1m: number;
  roc5m: number;
  vol: number;
  vol_avg: number;
  book_imb: number;
  signal: boolean;
}

/* =========================
   Database Setup & State
   ========================= */
let DB_ENABLED = false;
const pool = config.database.url
  ? new Pool({
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: false },
      max: config.database.poolSize,
    })
  : null;

/* =========================
   Initialization
   ========================= */
export async function initDatabase(): Promise<boolean> {
  if (!pool) { 
    log('❌ DB disabled - DATABASE_URL not provided');
    return false; 
  }
  try {
    const r = await pool.query('select 1 as ok');
    DB_ENABLED = (r.rows[0] as { ok: number }).ok === 1;
    log('✅ DB connected for web app');
    return DB_ENABLED;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log('❌ DB connection failed:', errorMessage);
    DB_ENABLED = false;
    return false;
  }
}

/* =========================
   Data Retrieval
   ========================= */
export async function getInitialData(symbols: string[]): Promise<InitialData> {
  if (!DB_ENABLED || !pool) {
    return { ticks: [], signals: [] };
  }
  
  try {
    // Latest tick per symbol
    const ticksQ = `
      SELECT DISTINCT ON (symbol) 
        symbol, ts, close, roc1m, roc5m, vol, vol_avg, book_imb
      FROM ticks
      WHERE symbol = ANY($1)
      ORDER BY symbol, ts DESC
    `;
    
    // Recent signals (last 100)
    const sigsQ = `
      SELECT ts, symbol, close, roc1m, roc5m, vol, vol_avg, book_imb
      FROM signals
      ORDER BY ts DESC
      LIMIT 100
    `;
    
    const [ticks, sigs] = await Promise.all([
      pool.query(ticksQ, [symbols]),
      pool.query(sigsQ),
    ]);
    
    return { ticks: ticks.rows as DbTick[], signals: sigs.rows as DbSignal[] };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log('❌ DB query error:', errorMessage);
    return { ticks: [], signals: [] };
  }
}

/* =========================
   Live Data Streaming
   ========================= */
export async function getLiveTicks(symbols: string[], since: Date): Promise<LiveTick[]> {
  if (!DB_ENABLED || !pool) {
    return [];
  }
  
  try {
    const query = `
      SELECT symbol, ts, close, roc1m, roc5m, vol, vol_avg, book_imb, signal
      FROM ticks
      WHERE symbol = ANY($1) AND ts > $2
      ORDER BY ts DESC
      LIMIT 1000
    `;
    
    const result = await pool.query(query, [symbols, since.toISOString()]);
    return result.rows.map(row => ({
      ...row,
      ts: new Date(row.ts).toISOString()
    }));
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log('❌ Live ticks query error:', errorMessage);
    return [];
  }
}

export async function getRecentSignals(since: Date): Promise<DbSignal[]> {
  if (!DB_ENABLED || !pool) {
    return [];
  }
  
  try {
    const query = `
      SELECT ts, symbol, close, roc1m, roc5m, vol, vol_avg, book_imb
      FROM signals
      WHERE ts > $1
      ORDER BY ts DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [since.toISOString()]);
    return result.rows.map(row => ({
      ...row,
      ts: new Date(row.ts).toISOString()
    }));
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log('❌ Recent signals query error:', errorMessage);
    return [];
  }
}

export { DB_ENABLED };

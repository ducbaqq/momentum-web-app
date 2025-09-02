import { Pool } from 'pg';
import type { Candle } from '../types/index.js';

// Shared database connection
export const createPool = () => new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
export async function testConnection(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✓ Database connected successfully');
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
}

// Get recent 1-minute candles like backtest does - this matches backtest behavior exactly
export async function getRecentCandles(
  pool: Pool,
  symbols: string[], 
  lookbackMinutes: number = 60
): Promise<Record<string, Candle[]>> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - lookbackMinutes * 60 * 1000);
  
  console.log(`🔍 [SHARED] Fetching 1m candles from ${startTime.toISOString()} to ${endTime.toISOString()}`);
  
  const query = `
    SELECT
      o.symbol,
      o.ts,
      o.open, o.high, o.low, o.close, o.volume, o.trades_count, o.vwap_minute,
      f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
      f.rsi_14, f.ema_12, f.ema_20, f.ema_26, f.ema_50, f.macd, f.macd_signal,
      f.bb_upper, f.bb_lower, f.bb_basis, f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
    FROM ohlcv_1m o
    LEFT JOIN features_1m f ON f.symbol=o.symbol AND f.ts=o.ts
    WHERE o.symbol = ANY($1) AND o.ts >= $2 AND o.ts <= $3
    ORDER BY o.symbol, o.ts ASC
  `;
  
  const result = await pool.query(query, [symbols, startTime.toISOString(), endTime.toISOString()]);
  
  console.log(`🔍 [SHARED] Found ${result.rows.length} 1-minute candles across ${symbols.length} symbols`);
  
  const candlesBySymbol: Record<string, Candle[]> = {};
  
  // Initialize empty arrays for all symbols
  for (const symbol of symbols) {
    candlesBySymbol[symbol] = [];
  }
  
  // Process database rows into candles
  for (const row of result.rows) {
    const candle: Candle = {
      ts: row.ts,
      open: Number(row.open), 
      high: Number(row.high), 
      low: Number(row.low),
      close: Number(row.close), 
      volume: Number(row.volume),
      trades_count: row.trades_count ? Number(row.trades_count) : null,
      vwap_minute: row.vwap_minute ? Number(row.vwap_minute) : null,
      roc_1m: row.roc_1m, 
      roc_5m: row.roc_5m, 
      roc_15m: row.roc_15m, 
      roc_30m: row.roc_30m, 
      roc_1h: row.roc_1h, 
      roc_4h: row.roc_4h,
      rsi_14: row.rsi_14, 
      ema_12: row.ema_12,
      ema_20: row.ema_20,
      ema_26: row.ema_26, 
      ema_50: row.ema_50, 
      macd: row.macd, 
      macd_signal: row.macd_signal,
      bb_upper: row.bb_upper, 
      bb_lower: row.bb_lower, 
      bb_basis: row.bb_basis,
      vol_avg_20: row.vol_avg_20, 
      vol_mult: row.vol_mult,
      book_imb: row.book_imb, 
      spread_bps: row.spread_bps
    };
    
    candlesBySymbol[row.symbol].push(candle);
  }
  
  return candlesBySymbol;
}

// Get live ticker prices (most recent 1m candle for position management)
export async function getLivePrices(pool: Pool, symbols: string[]): Promise<Record<string, number>> {
  const query = `
    SELECT DISTINCT ON (symbol) 
      symbol,
      close::double precision AS close
    FROM ohlcv_1m 
    WHERE symbol = ANY($1)
    ORDER BY symbol, ts DESC
  `;
  
  const result = await pool.query(query, [symbols]);
  
  const prices: Record<string, number> = {};
  for (const row of result.rows) {
    prices[row.symbol] = Number(row.close);
  }
  
  return prices;
}

// Utility function to get the most recent completed 15m period
export function getMostRecentCompleted15mPeriod(): Date {
  const now = new Date();
  const currentMinutes = now.getUTCMinutes();
  const currentSeconds = now.getUTCSeconds();
  const currentMilliseconds = now.getUTCMilliseconds();
  
  // Calculate how many minutes past the last 15-minute boundary
  const minutesPastBoundary = currentMinutes % 15;
  
  // If we're exactly on a 15-minute boundary (and have some buffer), use the previous period
  // Otherwise, use the current incomplete period's start
  let targetMinutes: number;
  if (minutesPastBoundary === 0 && currentSeconds < 30) {
    // We're very close to a 15-minute boundary, use the previous complete period
    targetMinutes = currentMinutes - 15;
  } else if (minutesPastBoundary < 2) {
    // We're in the first 2 minutes of a period, use the previous complete period  
    targetMinutes = currentMinutes - minutesPastBoundary - 15;
  } else {
    // We're far enough into the current period, use its start
    targetMinutes = currentMinutes - minutesPastBoundary;
  }
  
  // Handle negative minutes (wrap to previous hour)
  let targetHour = now.getUTCHours();
  if (targetMinutes < 0) {
    targetMinutes += 60;
    targetHour -= 1;
    if (targetHour < 0) {
      targetHour = 23;
      now.setUTCDate(now.getUTCDate() - 1);
    }
  }
  
  const targetPeriodStart = new Date(now);
  targetPeriodStart.setUTCHours(targetHour, targetMinutes, 0, 0);
  
  return targetPeriodStart;
}
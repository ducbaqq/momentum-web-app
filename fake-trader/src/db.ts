import { Pool } from 'pg';
import type { FakeTradeRun, FakeTrade, FakePosition, FakeSignal, Candle } from './types.js';

// Timeframe configuration
type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

const TIMEFRAME_CONFIGS: Record<Timeframe, { minutes: number; label: string }> = {
  '1m': { minutes: 1, label: '1 minute' },
  '5m': { minutes: 5, label: '5 minutes' },
  '15m': { minutes: 15, label: '15 minutes' },
  '30m': { minutes: 30, label: '30 minutes' },
  '1h': { minutes: 60, label: '1 hour' },
  '4h': { minutes: 240, label: '4 hours' },
  '1d': { minutes: 1440, label: '1 day' }
};

function getTimeframeMinutes(timeframe: Timeframe): number {
  return TIMEFRAME_CONFIGS[timeframe].minutes;
}

// Helper function to process candle query results
function processCandlesResult(result: any, symbols: string[]): Record<string, Candle[]> {
  const candlesBySymbol: Record<string, Candle[]> = {};

  for (const symbol of symbols) {
    candlesBySymbol[symbol] = [];
  }

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

    candlesBySymbol[row.symbol] = candlesBySymbol[row.symbol] || [];
    candlesBySymbol[row.symbol].push(candle);
  }

  return candlesBySymbol;
}

// Initialize database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection
export async function testConnection(): Promise<void> {
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

// Get active trading runs (including winding down runs)
export async function getActiveRuns(): Promise<FakeTradeRun[]> {
  const query = `
    SELECT * FROM ft_runs 
    WHERE status IN ('active', 'winding_down')
    ORDER BY created_at DESC
  `;
  
  console.log('[DB] Querying for active runs...');
  const result = await pool.query(query);
  console.log(`[DB] Found ${result.rows.length} runs with status 'active' or 'winding_down'`);
  
  // Log all runs and their statuses for debugging
  if (result.rows.length === 0) {
    // Check if there are ANY runs at all
    const allRunsQuery = await pool.query('SELECT run_id, name, status FROM ft_runs ORDER BY created_at DESC LIMIT 5');
    console.log(`[DB] Total runs in database: ${allRunsQuery.rows.length}`);
    if (allRunsQuery.rows.length > 0) {
      console.log('[DB] Sample runs:', allRunsQuery.rows.map(r => `${r.run_id.substring(0, 8)}... - ${r.name || 'unnamed'} - status: ${r.status}`));
    }
  }
  
  return result.rows.map(row => ({
    ...row,
    starting_capital: Number(row.starting_capital),
    current_capital: Number(row.current_capital),
    max_concurrent_positions: Number(row.max_concurrent_positions),
    seed: row.seed ? Number(row.seed) : undefined,
  }));
}

// Get live ticker prices (most recent 1m candle for position management)
export async function getLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const query = `
    SELECT DISTINCT ON (symbol) 
      symbol,
      close::double precision AS close
    FROM ohlcv_1m 
    WHERE symbol = ANY($1)
    AND ts >= NOW() - INTERVAL '10 minutes'  -- Look back 10 minutes to find latest
    ORDER BY symbol, ts DESC
  `;
  
  const result = await pool.query(query, [symbols]);
  
  const prices: Record<string, number> = {};
  for (const row of result.rows) {
    prices[row.symbol] = Number(row.close);
  }
  
  return prices;
}

// Helper function to get the most recent completed 15-minute period
function getMostRecentCompleted15mPeriod(): Date {
  const now = new Date();
  const currentMinutes = now.getUTCMinutes();
  
  // Calculate minutes into the current 15-minute period
  const minutesInto15mPeriod = currentMinutes % 15;
  
  // Always go back to the most recent COMPLETED period
  // If we're less than 2 minutes into current period, go back 2 periods (to be safe for data lag)
  // Otherwise go back 1 period (the one that just completed)
  let targetMinutes: number;
  if (minutesInto15mPeriod < 2) {
    // Go back to previous completed period (2 periods back)
    targetMinutes = currentMinutes - minutesInto15mPeriod - 30;
  } else {
    // Go back to the period that just completed (1 period back)
    targetMinutes = currentMinutes - minutesInto15mPeriod - 15;
  }
  
  // Handle negative minutes (wrap to previous hour)
  if (targetMinutes < 0) {
    targetMinutes += 60;
    const targetPeriodStart = new Date(now);
    targetPeriodStart.setUTCHours(targetPeriodStart.getUTCHours() - 1);
    targetPeriodStart.setUTCMinutes(targetMinutes, 0, 0);
    return targetPeriodStart;
  }
  
  // Calculate the start of the target 15-minute period
  const targetPeriodStart = new Date(now);
  targetPeriodStart.setUTCMinutes(targetMinutes, 0, 0);
  
  return targetPeriodStart;
}

// Get completed 15m candle data for entry signals (using aggregated 1m data with pre-calculated features)
// Get recent 1-minute candles like backtest does - this matches backtest behavior exactly
export async function getRecentCandles(symbols: string[], lookbackMinutes: number = 60, timeframe: string = '1m'): Promise<Record<string, Candle[]>> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - lookbackMinutes * 60 * 1000);

  // If timeframe is 1m, use the original simple query
  if (timeframe === '1m') {
    console.log(`🔍 [FAKE TRADER] Fetching 1m candles from ${startTime.toISOString()} to ${endTime.toISOString()}`);

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
    console.log(`🔍 [FAKE TRADER] Found ${result.rows.length} 1-minute candles across ${symbols.length} symbols`);
    return processCandlesResult(result, symbols);
  }

  // For higher timeframes, aggregate using SQL similar to backtest approach
  const timeframeMinutes = getTimeframeMinutes(timeframe as Timeframe);
  console.log(`🔍 [FAKE TRADER] Fetching ${timeframe} candles (aggregated from 1m) from ${startTime.toISOString()} to ${endTime.toISOString()}`);

  const query = `
    WITH base AS (
      SELECT
        o.symbol,
        o.ts,
        o.open::double precision AS open, o.high::double precision AS high,
        o.low::double precision AS low, o.close::double precision AS close,
        o.volume::double precision AS volume, o.trades_count, o.vwap_minute,
        f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
        f.rsi_14, f.ema_12, f.ema_20, f.ema_26, f.ema_50, f.macd, f.macd_signal,
        f.bb_upper, f.bb_lower, f.bb_basis, f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
      FROM ohlcv_1m o
      LEFT JOIN features_1m f ON f.symbol=o.symbol AND f.ts=o.ts
      WHERE o.symbol = ANY($1) AND o.ts >= $2::timestamp AND o.ts <= $3::timestamp
    ),
    buckets AS (
      SELECT *,
        to_timestamp(floor(extract(epoch from ts) / ($4::int*60)) * ($4::int*60)) AT TIME ZONE 'UTC' AS bucket
      FROM base
    ),
    agg AS (
      SELECT
        symbol,
        bucket AS ts,
        (ARRAY_AGG(open ORDER BY ts))[1] AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        (ARRAY_AGG(close ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(close), 1)] AS close,
        SUM(volume) AS volume,
        SUM(trades_count) AS trades_count,
        (ARRAY_AGG(vwap_minute ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vwap_minute), 1)] AS vwap_minute,
        -- For technical indicators, use values from the last candle in the bucket
        (ARRAY_AGG(roc_1m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_1m), 1)] AS roc_1m,
        (ARRAY_AGG(roc_5m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_5m), 1)] AS roc_5m,
        (ARRAY_AGG(roc_15m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_15m), 1)] AS roc_15m,
        (ARRAY_AGG(roc_30m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_30m), 1)] AS roc_30m,
        (ARRAY_AGG(roc_1h ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_1h), 1)] AS roc_1h,
        (ARRAY_AGG(roc_4h ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_4h), 1)] AS roc_4h,
        (ARRAY_AGG(rsi_14 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(rsi_14), 1)] AS rsi_14,
        (ARRAY_AGG(ema_12 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_12), 1)] AS ema_12,
        (ARRAY_AGG(ema_20 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_20), 1)] AS ema_20,
        (ARRAY_AGG(ema_26 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_26), 1)] AS ema_26,
        (ARRAY_AGG(ema_50 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_50), 1)] AS ema_50,
        (ARRAY_AGG(macd ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(macd), 1)] AS macd,
        (ARRAY_AGG(macd_signal ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(macd_signal), 1)] AS macd_signal,
        (ARRAY_AGG(bb_upper ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_upper), 1)] AS bb_upper,
        (ARRAY_AGG(bb_lower ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_lower), 1)] AS bb_lower,
        (ARRAY_AGG(bb_basis ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_basis), 1)] AS bb_basis,
        (ARRAY_AGG(vol_avg_20 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vol_avg_20), 1)] AS vol_avg_20,
        (ARRAY_AGG(vol_mult ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vol_mult), 1)] AS vol_mult,
        (ARRAY_AGG(book_imb ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(book_imb), 1)] AS book_imb,
        (ARRAY_AGG(spread_bps ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(spread_bps), 1)] AS spread_bps
      FROM buckets
      GROUP BY symbol, bucket
      HAVING COUNT(*) > 0
    )
    SELECT * FROM agg ORDER BY symbol, ts ASC
  `;

  const result = await pool.query(query, [symbols, startTime.toISOString(), endTime.toISOString(), timeframeMinutes]);
  console.log(`🔍 [FAKE TRADER] Found ${result.rows.length} ${timeframe} candles across ${symbols.length} symbols`);
  return processCandlesResult(result, symbols);
}

export async function getCompleted15mCandles(symbols: string[]): Promise<Record<string, Candle>> {
  // Calculate the target 15-minute period to fetch
  const targetPeriod = getMostRecentCompleted15mPeriod();
  const periodEnd = new Date(targetPeriod.getTime() + 15 * 60 * 1000); // Add 15 minutes
  
  console.log(`🔍 [FAKE TRADER] Fetching 15m candle for period: ${targetPeriod.toISOString()} to ${periodEnd.toISOString()}`);
  
  // Use the same approach as backtest worker - aggregate 1m OHLCV data with pre-calculated features
  const query = `
    WITH aggregated_15m_candles AS (
      SELECT 
        o.symbol,
        to_timestamp(floor(extract(epoch from o.ts) / (15*60)) * (15*60)) AT TIME ZONE 'UTC' as candle_start,
        AVG(o.open::double precision) as open,
        MAX(o.high::double precision) as high,
        MIN(o.low::double precision) as low,
        AVG(o.close::double precision) as close,
        SUM(o.volume::double precision) as volume,
        -- Aggregate features - use the latest values in each 15m period
        AVG(COALESCE(f.roc_5m, 0)) as roc_5m,
        AVG(COALESCE(f.vol_mult, 1)) as vol_mult,
        AVG(COALESCE(f.roc_1m, 0)) as roc_1m,
        AVG(COALESCE(f.roc_15m, 0)) as roc_15m,
        AVG(COALESCE(f.roc_30m, 0)) as roc_30m,
        AVG(COALESCE(f.roc_1h, 0)) as roc_1h,
        AVG(COALESCE(f.roc_4h, 0)) as roc_4h,
        AVG(COALESCE(f.rsi_14, 50)) as rsi_14,
        AVG(COALESCE(f.ema_20, o.close::double precision)) as ema_20,
        AVG(COALESCE(f.ema_50, o.close::double precision)) as ema_50,
        AVG(COALESCE(f.bb_upper, o.close::double precision * 1.02)) as bb_upper,
        AVG(COALESCE(f.bb_lower, o.close::double precision * 0.98)) as bb_lower,
        AVG(COALESCE(f.spread_bps, 5)) as spread_bps,
        COUNT(*) as minute_count
      FROM ohlcv_1m o
      LEFT JOIN features_1m f ON f.symbol = o.symbol AND f.ts = o.ts
      WHERE o.symbol = ANY($1)
        AND o.ts >= $2::timestamp 
        AND o.ts < $3::timestamp
      GROUP BY o.symbol, candle_start
      HAVING COUNT(*) >= 10  -- Ensure we have most of the 15m period data
    )
    SELECT 
      symbol,
      candle_start as ts,
      open, high, low, close, volume,
      roc_5m, vol_mult, roc_1m, roc_15m, roc_30m, roc_1h, roc_4h,
      rsi_14, ema_20, ema_50, bb_upper, bb_lower, spread_bps,
      minute_count
    FROM aggregated_15m_candles
    WHERE candle_start = $2::timestamp  -- Only get the target period
    ORDER BY symbol
  `;
  
  const result = await pool.query(query, [symbols, targetPeriod.toISOString(), periodEnd.toISOString()]);
  
  console.log(`🔍 [FAKE TRADER] Query returned ${result.rows.length} rows for target period ${targetPeriod.toISOString()}`);
  if (result.rows.length > 0) {
    console.log(`🔍 [FAKE TRADER] Sample row:`, JSON.stringify(result.rows[0], null, 2));
  }
  
  const candles: Record<string, Candle> = {};
  for (const row of result.rows) {
    candles[row.symbol] = {
      ts: row.ts,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      // Use pre-calculated features from the features_1m table
      roc_5m: Number(row.roc_5m) || 0,
      vol_mult: Number(row.vol_mult) || 1,
      roc_1m: Number(row.roc_1m) || 0,
      roc_15m: Number(row.roc_15m) || 0,
      roc_30m: Number(row.roc_30m) || 0,
      roc_1h: Number(row.roc_1h) || 0,
      roc_4h: Number(row.roc_4h) || 0,
      rsi_14: Number(row.rsi_14) || 50,
      ema_20: Number(row.ema_20) || Number(row.close),
      ema_50: Number(row.ema_50) || Number(row.close),
      // ema_200 removed - not in backtest interface
      macd: 0, // Not available in current features
      macd_signal: 0,
      bb_upper: Number(row.bb_upper) || Number(row.close) * 1.02,
      bb_lower: Number(row.bb_lower) || Number(row.close) * 0.98,
      book_imb: 1.0,
      spread_bps: Number(row.spread_bps) || 5,
      vol_avg_20: Number(row.volume) || 0, // Use current volume as fallback
    };
  }
  
  return candles;
}

// Check if new 15m candles are available since last check (using 1m data)
export async function hasNew15mCandles(symbols: string[], lastCheckTime?: string): Promise<boolean> {
  const timeThreshold = lastCheckTime || new Date(Date.now() - 16 * 60 * 1000).toISOString(); // Default: 16 minutes ago
  
  const query = `
    WITH current_15m_periods AS (
      SELECT DISTINCT
        symbol,
        date_trunc('hour', ts) + INTERVAL '15 minutes' * FLOOR(EXTRACT(MINUTE FROM ts) / 15) as period_start
      FROM ohlcv_1m
      WHERE symbol = ANY($1)
      AND ts > $2
      AND ts <= NOW() - INTERVAL '15 minutes'  -- Only completed 15m periods
    )
    SELECT COUNT(DISTINCT period_start) as new_count
    FROM current_15m_periods
  `;
  
  const result = await pool.query(query, [symbols, timeThreshold]);
  return parseInt(result.rows[0].new_count) > 0;
}

// Store last processed candle timestamp for run
export async function updateLastProcessedCandle(runId: string, symbol: string, timestamp: string): Promise<void> {
  const query = `
    UPDATE ft_runs 
    SET last_processed_candle = $2
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, timestamp]);
}

// Get last processed candle timestamp for run and symbol
export async function getLastProcessedCandle(runId: string, symbol: string): Promise<string | null> {
  const query = `
    SELECT last_processed_candle
    FROM ft_runs
    WHERE run_id = $1
  `;

  const result = await pool.query(query, [runId]);
  return result.rows[0]?.last_processed_candle || null;
}

// Legacy function for backward compatibility
export async function getLastProcessedCandleForRun(runId: string): Promise<string | null> {
  return getLastProcessedCandle(runId, '');
}

// Keep the original function for backward compatibility (now uses live 1m data)
export async function getCurrentCandles(symbols: string[]): Promise<Record<string, Candle>> {
  const query = `
    WITH latest_candles AS (
      SELECT DISTINCT ON (symbol) 
        symbol,
        ts,
        open::double precision AS open,
        high::double precision AS high,
        low::double precision AS low,
        close::double precision AS close,
        volume::double precision AS volume
      FROM ohlcv_1m 
      WHERE symbol = ANY($1)
      AND ts >= NOW() - INTERVAL '1 hour'  -- Look back 1 hour to find latest
      ORDER BY symbol, ts DESC
    ),
    latest_features AS (
      SELECT DISTINCT ON (symbol)
        symbol,
        ts,
        roc_1m, roc_5m, roc_15m, roc_30m, roc_1h, roc_4h,
        rsi_14, ema_20, ema_50,
        macd, macd_signal, bb_upper, bb_lower,
        vol_avg_20, vol_mult, book_imb, spread_bps
      FROM features_1m
      WHERE symbol = ANY($1)
      AND ts >= NOW() - INTERVAL '1 hour'
      ORDER BY symbol, ts DESC
    )
    SELECT 
      c.*,
      f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
      f.rsi_14, f.ema_20, f.ema_50,
      f.macd, f.macd_signal, f.bb_upper, f.bb_lower,
      f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
    FROM latest_candles c
    LEFT JOIN latest_features f ON f.symbol = c.symbol AND f.ts = c.ts
  `;
  
  const result = await pool.query(query, [symbols]);
  
  const candles: Record<string, Candle> = {};
  for (const row of result.rows) {
    candles[row.symbol] = {
      ts: row.ts,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      roc_1m: row.roc_1m,
      roc_5m: row.roc_5m,
      roc_15m: row.roc_15m,
      roc_30m: row.roc_30m,
      roc_1h: row.roc_1h,
      roc_4h: row.roc_4h,
      rsi_14: row.rsi_14,
      ema_20: row.ema_20,
      ema_50: row.ema_50,
      // ema_200 removed - not in backtest interface
      macd: row.macd,
      macd_signal: row.macd_signal,
      bb_upper: row.bb_upper,
      bb_lower: row.bb_lower,
      vol_avg_20: row.vol_avg_20,
      vol_mult: row.vol_mult,
      book_imb: row.book_imb,
      spread_bps: row.spread_bps,
    };
  }
  
  return candles;
}

// Get current positions for a run
export async function getCurrentPositions(runId: string): Promise<FakePosition[]> {
  const query = `
    SELECT * FROM ft_positions 
    WHERE run_id = $1 AND status = 'open'
    ORDER BY opened_at DESC
  `;
  
  const result = await pool.query(query, [runId]);
  return result.rows.map(row => ({
    ...row,
    size: Number(row.size),
    entry_price: Number(row.entry_price),
    current_price: row.current_price ? Number(row.current_price) : undefined,
    unrealized_pnl: Number(row.unrealized_pnl),
    cost_basis: Number(row.cost_basis),
    market_value: row.market_value ? Number(row.market_value) : undefined,
    stop_loss: row.stop_loss ? Number(row.stop_loss) : undefined,
    take_profit: row.take_profit ? Number(row.take_profit) : undefined,
    leverage: Number(row.leverage),
  }));
}

// Create new trade
export async function createTrade(trade: Omit<FakeTrade, 'trade_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_trades (
      run_id, symbol, side, entry_ts, qty, entry_px, 
      realized_pnl, unrealized_pnl, fees, reason, leverage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING trade_id
  `;
  
  const values = [
    trade.run_id, trade.symbol, trade.side, trade.entry_ts, trade.qty, trade.entry_px,
    trade.realized_pnl, trade.unrealized_pnl, trade.fees, trade.reason, trade.leverage, trade.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].trade_id;
}

// Create new position
export async function createPosition(position: Omit<FakePosition, 'position_id' | 'opened_at' | 'last_update'>): Promise<string> {
  const query = `
    INSERT INTO ft_positions (
      run_id, symbol, side, size, entry_price, current_price,
      unrealized_pnl, cost_basis, market_value, stop_loss, take_profit, leverage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING position_id
  `;
  
  const values = [
    position.run_id, position.symbol, position.side, position.size, position.entry_price, position.current_price,
    position.unrealized_pnl, position.cost_basis, position.market_value, position.stop_loss, position.take_profit, 
    position.leverage, position.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].position_id;
}

// Update position with current price and PnL
export async function updatePosition(positionId: string, currentPrice: number, unrealizedPnl: number, marketValue: number): Promise<void> {
  const query = `
    UPDATE ft_positions 
    SET current_price = $2, unrealized_pnl = $3, market_value = $4, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, currentPrice, unrealizedPnl, marketValue]);
}

// Close position
export async function closePosition(positionId: string, exitPrice: number, realizedPnl: number): Promise<void> {
  const query = `
    UPDATE ft_positions 
    SET status = 'closed', current_price = $2, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, exitPrice]);
  
  // Also update the corresponding trade
  const updateTradeQuery = `
    UPDATE ft_trades 
    SET exit_ts = NOW(), exit_px = $2, realized_pnl = $3, status = 'closed'
    WHERE run_id = (SELECT run_id FROM ft_positions WHERE position_id = $1)
    AND symbol = (SELECT symbol FROM ft_positions WHERE position_id = $1)
    AND status = 'open'
  `;
  
  await pool.query(updateTradeQuery, [positionId, exitPrice, realizedPnl]);
}

// Log strategy signal
export async function logSignal(signal: Omit<FakeSignal, 'signal_id' | 'created_at'>): Promise<void> {
  const query = `
    INSERT INTO ft_signals (
      run_id, symbol, signal_type, side, size, price,
      candle_data, strategy_state, rejection_reason, executed, execution_price, execution_notes, signal_ts
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `;
  
  const values = [
    signal.run_id, signal.symbol, signal.signal_type, signal.side, signal.size, signal.price,
    JSON.stringify(signal.candle_data), JSON.stringify(signal.strategy_state), signal.rejection_reason,
    signal.executed, signal.execution_price, signal.execution_notes, signal.signal_ts
  ];
  
  await pool.query(query, values);
}

// Update run status
export async function updateRunStatus(runId: string, status: string, error?: string): Promise<void> {
  const query = `
    UPDATE ft_runs 
    SET status = $2, last_update = NOW(), error = $3
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, status, error]);
}

// Get trades for a run
export async function getTrades(runId: string): Promise<FakeTrade[]> {
  const query = `
    SELECT * FROM ft_trades
    WHERE run_id = $1
    ORDER BY entry_ts DESC
  `;

  const result = await pool.query(query, [runId]);
  return result.rows.map(row => ({
    ...row,
    qty: Number(row.qty),
    entry_px: Number(row.entry_px),
    exit_px: row.exit_px ? Number(row.exit_px) : undefined,
    realized_pnl: Number(row.realized_pnl),
    unrealized_pnl: Number(row.unrealized_pnl),
    fees: Number(row.fees),
    leverage: Number(row.leverage),
  }));
}

// Update run capital
export async function updateRunCapital(runId: string, currentCapital: number): Promise<void> {
  const query = `
    UPDATE ft_runs
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `;

  await pool.query(query, [runId, currentCapital]);
}
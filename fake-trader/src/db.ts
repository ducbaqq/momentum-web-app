import { Pool } from 'pg';
import type { FakeTradeRun, FakeTrade, FakePosition, FakeSignal, Candle } from './types.js';

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
  
  const result = await pool.query(query);
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

// Get completed 15m candle data for entry signals (using 1m data aggregated to 15m intervals)
export async function getCompleted15mCandles(symbols: string[], lastProcessedTime?: string): Promise<Record<string, Candle>> {
  // Enhanced version - aggregate from 1m candles and calculate basic indicators
  const query = `
    WITH raw_1m_data AS (
      SELECT 
        symbol,
        ts,
        open::double precision as open,
        high::double precision as high,
        low::double precision as low,
        close::double precision as close,
        volume::double precision as volume,
        to_timestamp(floor(extract(epoch from ts) / (15*60)) * (15*60)) AT TIME ZONE 'UTC' as candle_start,
        ROW_NUMBER() OVER (PARTITION BY symbol, to_timestamp(floor(extract(epoch from ts) / (15*60)) * (15*60)) ORDER BY ts ASC) as rn_asc,
        ROW_NUMBER() OVER (PARTITION BY symbol, to_timestamp(floor(extract(epoch from ts) / (15*60)) * (15*60)) ORDER BY ts DESC) as rn_desc
      FROM ohlcv_1m 
      WHERE symbol = ANY($1)
      AND ts <= NOW() - INTERVAL '15 minutes'  -- Only completed 15m periods
      AND ts >= NOW() - INTERVAL '6 hours'     -- Look back 6 hours for more data
    ),
    aggregated_15m_candles AS (
      SELECT 
        symbol,
        candle_start,
        MAX(CASE WHEN rn_asc = 1 THEN open END) as open,
        MAX(high) as high,
        MIN(low) as low,
        MAX(CASE WHEN rn_desc = 1 THEN close END) as close,
        SUM(volume) as volume
      FROM raw_1m_data
      GROUP BY symbol, candle_start
      HAVING COUNT(*) >= 10  -- Ensure we have most of the 15m period data
    ),
    historical_candles AS (
      SELECT 
        symbol,
        candle_start as ts,
        open, high, low, close, volume,
        LAG(close, 5) OVER (PARTITION BY symbol ORDER BY candle_start) as close_5_periods_ago,
        LAG(volume, 20) OVER (PARTITION BY symbol ORDER BY candle_start) as volume_20_periods_ago,
        AVG(volume) OVER (PARTITION BY symbol ORDER BY candle_start ROWS 20 PRECEDING) as vol_avg_20
      FROM aggregated_15m_candles
    ),
    latest_15m_candles AS (
      SELECT  
        symbol,
        ts,
        open, high, low, close, volume,
        close_5_periods_ago,
        vol_avg_20,
        -- Calculate basic indicators
        CASE 
          WHEN close_5_periods_ago > 0 THEN ((close / close_5_periods_ago - 1) * 100)
          ELSE 0 
        END as roc_5m,
        CASE 
          WHEN vol_avg_20 > 0 THEN (volume / vol_avg_20)
          ELSE 1 
        END as vol_mult,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY ts DESC) as rn
      FROM historical_candles
      WHERE ($2::timestamp IS NULL OR ts > $2::timestamp)
    )
    SELECT 
      symbol, ts, open, high, low, close, volume, roc_5m, vol_mult, vol_avg_20
    FROM latest_15m_candles
    WHERE roc_5m IS NOT NULL  -- Only include candles where we can calculate indicators
      AND rn = 1  -- Only get the most recent candle per symbol
    ORDER BY symbol, ts DESC
  `;
  
  const result = await pool.query(query, [symbols, lastProcessedTime || null]);
  
  const candles: Record<string, Candle> = {};
  for (const row of result.rows) {
    // Only keep the most recent candle per symbol
    if (!candles[row.symbol]) {
      candles[row.symbol] = {
        ts: row.ts,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
        // Basic calculated indicators
        roc_5m: Number(row.roc_5m) || 0,
        vol_mult: Number(row.vol_mult) || 1,
        vol_avg_20: Number(row.vol_avg_20) || 0,
        // Set reasonable defaults for missing indicators to prevent strategy failures
        roc_1m: 0,
        roc_15m: 0,
        roc_30m: 0,
        roc_1h: 0,
        roc_4h: 0,
        rsi_14: 50,
        ema_20: Number(row.close),
        ema_50: Number(row.close),
        ema_200: Number(row.close),
        macd: 0,
        macd_signal: 0,
        bb_upper: Number(row.close) * 1.02,
        bb_lower: Number(row.close) * 0.98,
        book_imb: 1.0,
        spread_bps: 5, // Reasonable default spread
      };
    }
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
export async function updateLastProcessedCandle(runId: string, timestamp: string): Promise<void> {
  const query = `
    UPDATE ft_runs 
    SET last_processed_candle = $2
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, timestamp]);
}

// Get last processed candle timestamp for run  
export async function getLastProcessedCandle(runId: string): Promise<string | null> {
  const query = `
    SELECT last_processed_candle
    FROM ft_runs 
    WHERE run_id = $1
  `;
  
  const result = await pool.query(query, [runId]);
  return result.rows[0]?.last_processed_candle || null;
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
      ema_200: row.ema_50, // Use ema_50 as proxy for ema_200
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

// Update run capital
export async function updateRunCapital(runId: string, currentCapital: number): Promise<void> {
  const query = `
    UPDATE ft_runs 
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, currentCapital]);
}
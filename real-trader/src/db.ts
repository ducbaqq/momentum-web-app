import { Pool } from 'pg';
import type { RealTradeRun, RealTrade, RealPosition, RealSignal, Candle } from './types.js';

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
export async function getActiveRuns(): Promise<RealTradeRun[]> {
  const query = `
    SELECT * FROM rt_runs 
    WHERE status IN ('active', 'winding_down')
    ORDER BY created_at DESC
  `;
  
  const result = await pool.query(query);
  return result.rows.map(row => ({
    ...row,
    starting_capital: Number(row.starting_capital),
    current_capital: Number(row.current_capital),
    max_concurrent_positions: Number(row.max_concurrent_positions),
    max_position_size_usd: Number(row.max_position_size_usd),
    daily_loss_limit_pct: Number(row.daily_loss_limit_pct),
    max_drawdown_pct: Number(row.max_drawdown_pct),
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
  
  console.log(`🔍 Query returned ${result.rows.length} rows`);
  if (result.rows.length > 0) {
    console.log(`🔍 Sample row:`, JSON.stringify(result.rows[0], null, 2));
  }
  
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
    UPDATE rt_runs 
    SET last_processed_candle = $2
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, timestamp]);
}

// Get last processed candle timestamp for run  
export async function getLastProcessedCandle(runId: string): Promise<string | null> {
  const query = `
    SELECT last_processed_candle
    FROM rt_runs 
    WHERE run_id = $1
  `;
  
  const result = await pool.query(query, [runId]);
  return result.rows[0]?.last_processed_candle || null;
}

// Get current positions for a run
export async function getCurrentPositions(runId: string): Promise<RealPosition[]> {
  const query = `
    SELECT * FROM rt_positions 
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
export async function createTrade(trade: Omit<RealTrade, 'trade_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO rt_trades (
      run_id, symbol, side, entry_ts, qty, entry_px, 
      realized_pnl, unrealized_pnl, fees, binance_order_id, binance_client_order_id,
      reason, leverage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING trade_id
  `;
  
  const values = [
    trade.run_id, trade.symbol, trade.side, trade.entry_ts, trade.qty, trade.entry_px,
    trade.realized_pnl, trade.unrealized_pnl, trade.fees, trade.binance_order_id, trade.binance_client_order_id,
    trade.reason, trade.leverage, trade.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].trade_id;
}

// Create new position
export async function createPosition(position: Omit<RealPosition, 'position_id' | 'opened_at' | 'last_update'>): Promise<string> {
  const query = `
    INSERT INTO rt_positions (
      run_id, symbol, side, size, entry_price, current_price,
      unrealized_pnl, cost_basis, market_value, stop_loss, take_profit, leverage,
      binance_position_side, binance_margin_type, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING position_id
  `;
  
  const values = [
    position.run_id, position.symbol, position.side, position.size, position.entry_price, position.current_price,
    position.unrealized_pnl, position.cost_basis, position.market_value, position.stop_loss, position.take_profit, 
    position.leverage, position.binance_position_side, position.binance_margin_type, position.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].position_id;
}

// Update position with current price and PnL
export async function updatePosition(positionId: string, currentPrice: number, unrealizedPnl: number, marketValue: number): Promise<void> {
  const query = `
    UPDATE rt_positions 
    SET current_price = $2, unrealized_pnl = $3, market_value = $4, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, currentPrice, unrealizedPnl, marketValue]);
}

// Close position
export async function closePosition(positionId: string, exitPrice: number, realizedPnl: number): Promise<void> {
  const query = `
    UPDATE rt_positions 
    SET status = 'closed', current_price = $2, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, exitPrice]);
  
  // Also update the corresponding trade
  const updateTradeQuery = `
    UPDATE rt_trades 
    SET exit_ts = NOW(), exit_px = $2, realized_pnl = $3, status = 'closed'
    WHERE run_id = (SELECT run_id FROM rt_positions WHERE position_id = $1)
    AND symbol = (SELECT symbol FROM rt_positions WHERE position_id = $1)
    AND status = 'open'
  `;
  
  await pool.query(updateTradeQuery, [positionId, exitPrice, realizedPnl]);
}

// Log strategy signal
export async function logSignal(signal: Omit<RealSignal, 'signal_id' | 'created_at'>): Promise<void> {
  const query = `
    INSERT INTO rt_signals (
      run_id, symbol, signal_type, side, size, price,
      candle_data, strategy_state, rejection_reason, executed, execution_price, execution_notes,
      binance_order_id, binance_response, signal_ts
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `;
  
  const values = [
    signal.run_id, signal.symbol, signal.signal_type, signal.side, signal.size, signal.price,
    JSON.stringify(signal.candle_data), JSON.stringify(signal.strategy_state), signal.rejection_reason,
    signal.executed, signal.execution_price, signal.execution_notes,
    signal.binance_order_id, JSON.stringify(signal.binance_response), signal.signal_ts
  ];
  
  await pool.query(query, values);
}

// Update run status
export async function updateRunStatus(runId: string, status: string, error?: string): Promise<void> {
  const query = `
    UPDATE rt_runs 
    SET status = $2, last_update = NOW(), error = $3
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, status, error]);
}

// Update run capital
export async function updateRunCapital(runId: string, currentCapital: number): Promise<void> {
  const query = `
    UPDATE rt_runs 
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, currentCapital]);
}

// Daily risk management functions
export async function getTodaysPnL(runId: string): Promise<number> {
  const query = `
    SELECT COALESCE(SUM(realized_pnl), 0) as daily_pnl
    FROM rt_trades
    WHERE run_id = $1 
    AND DATE(entry_ts) = CURRENT_DATE
    AND status = 'closed'
  `;
  
  const result = await pool.query(query, [runId]);
  return Number(result.rows[0].daily_pnl);
}

export async function getMaxDrawdown(runId: string): Promise<number> {
  const query = `
    SELECT COALESCE(MAX(max_drawdown_pct), 0) as max_dd
    FROM rt_daily_summary
    WHERE run_id = $1
  `;
  
  const result = await pool.query(query, [runId]);
  return Number(result.rows[0].max_dd);
}

export async function updateDailySummary(
  runId: string, 
  tradingDate: string, 
  summary: {
    tradesCount: number;
    realizedPnl: number;
    unrealizedPnl: number;
    fees: number;
    dailyReturnPct: number;
    maxDrawdownPct: number;
    capitalStart: number;
    capitalEnd: number;
    maxConcurrentPositions: number;
    totalExposure: number;
  }
): Promise<void> {
  const query = `
    INSERT INTO rt_daily_summary (
      run_id, trading_date, trades_count, realized_pnl, unrealized_pnl, fees,
      daily_return_pct, max_drawdown_pct, capital_start, capital_end,
      max_concurrent_positions, total_exposure
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (run_id, trading_date) 
    DO UPDATE SET
      trades_count = EXCLUDED.trades_count,
      realized_pnl = EXCLUDED.realized_pnl,
      unrealized_pnl = EXCLUDED.unrealized_pnl,
      fees = EXCLUDED.fees,
      daily_return_pct = EXCLUDED.daily_return_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      capital_start = EXCLUDED.capital_start,
      capital_end = EXCLUDED.capital_end,
      max_concurrent_positions = EXCLUDED.max_concurrent_positions,
      total_exposure = EXCLUDED.total_exposure
  `;
  
  const values = [
    runId, tradingDate, summary.tradesCount, summary.realizedPnl, summary.unrealizedPnl, summary.fees,
    summary.dailyReturnPct, summary.maxDrawdownPct, summary.capitalStart, summary.capitalEnd,
    summary.maxConcurrentPositions, summary.totalExposure
  ];
  
  await pool.query(query, values);
}
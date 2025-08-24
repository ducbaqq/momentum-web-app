import { Pool } from 'pg';
// Initialize database connection
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
// Test connection
export async function testConnection() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✓ Database connected successfully');
    }
    catch (error) {
        console.error('✗ Database connection failed:', error);
        throw error;
    }
}
// Get active trading runs (including winding down runs)
export async function getActiveRuns() {
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
export async function getLivePrices(symbols) {
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
    const prices = {};
    for (const row of result.rows) {
        prices[row.symbol] = Number(row.close);
    }
    return prices;
}
// Get completed 15m candle data for entry signals (using 1m data aggregated to 15m intervals)
export async function getCompleted15mCandles(symbols) {
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
        date_trunc('hour', ts) + INTERVAL '15 minutes' * FLOOR(EXTRACT(MINUTE FROM ts) / 15) as candle_start,
        ROW_NUMBER() OVER (PARTITION BY symbol, date_trunc('hour', ts) + INTERVAL '15 minutes' * FLOOR(EXTRACT(MINUTE FROM ts) / 15) ORDER BY ts ASC) as rn_asc,
        ROW_NUMBER() OVER (PARTITION BY symbol, date_trunc('hour', ts) + INTERVAL '15 minutes' * FLOOR(EXTRACT(MINUTE FROM ts) / 15) ORDER BY ts DESC) as rn_desc
      FROM ohlcv_1m 
      WHERE symbol = ANY($1)
      AND ts <= NOW() - INTERVAL '15 minutes'  -- Only completed 15m periods
      AND ts >= NOW() - INTERVAL '2 hours'     -- Look back 2 hours
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
    ),
    latest_15m_candles AS (
      SELECT  
        symbol,
        candle_start as ts,
        open, high, low, close, volume,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY candle_start DESC) as rn
      FROM aggregated_15m_candles
      ORDER BY symbol, candle_start DESC
    ),
    current_candle AS (
      SELECT * FROM latest_15m_candles WHERE rn = 1
    ),
    latest_1m_features AS (
      SELECT DISTINCT ON (symbol)
        symbol,
        ts,
        roc_1m, roc_5m, roc_15m, roc_30m, roc_1h, roc_4h,
        rsi_14, ema_20, ema_50,
        macd, macd_signal, bb_upper, bb_lower,
        vol_avg_20, vol_mult, book_imb, spread_bps
      FROM features_1m
      WHERE symbol = ANY($1)
      AND ts <= NOW() - INTERVAL '15 minutes'
      ORDER BY symbol, ts DESC
    )
    SELECT 
      c.*,
      f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
      f.rsi_14, f.ema_20, f.ema_50,
      f.macd, f.macd_signal, f.bb_upper, f.bb_lower,
      f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
    FROM current_candle c
    LEFT JOIN latest_1m_features f ON f.symbol = c.symbol AND ABS(EXTRACT(EPOCH FROM (f.ts - c.ts))) < 900  -- Within 15 minutes
  `;
    const result = await pool.query(query, [symbols]);
    const candles = {};
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
// Check if new 15m candles are available since last check (using 1m data)
export async function hasNew15mCandles(symbols, lastCheckTime) {
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
export async function updateLastProcessedCandle(runId, timestamp) {
    const query = `
    UPDATE rt_runs 
    SET last_processed_candle = $2
    WHERE run_id = $1
  `;
    await pool.query(query, [runId, timestamp]);
}
// Get last processed candle timestamp for run  
export async function getLastProcessedCandle(runId) {
    const query = `
    SELECT last_processed_candle
    FROM rt_runs 
    WHERE run_id = $1
  `;
    const result = await pool.query(query, [runId]);
    return result.rows[0]?.last_processed_candle || null;
}
// Get current positions for a run
export async function getCurrentPositions(runId) {
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
export async function createTrade(trade) {
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
export async function createPosition(position) {
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
export async function updatePosition(positionId, currentPrice, unrealizedPnl, marketValue) {
    const query = `
    UPDATE rt_positions 
    SET current_price = $2, unrealized_pnl = $3, market_value = $4, last_update = NOW()
    WHERE position_id = $1
  `;
    await pool.query(query, [positionId, currentPrice, unrealizedPnl, marketValue]);
}
// Close position
export async function closePosition(positionId, exitPrice, realizedPnl) {
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
export async function logSignal(signal) {
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
export async function updateRunStatus(runId, status, error) {
    const query = `
    UPDATE rt_runs 
    SET status = $2, last_update = NOW(), error = $3
    WHERE run_id = $1
  `;
    await pool.query(query, [runId, status, error]);
}
// Update run capital
export async function updateRunCapital(runId, currentCapital) {
    const query = `
    UPDATE rt_runs 
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `;
    await pool.query(query, [runId, currentCapital]);
}
// Daily risk management functions
export async function getTodaysPnL(runId) {
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
export async function getMaxDrawdown(runId) {
    const query = `
    SELECT COALESCE(MAX(max_drawdown_pct), 0) as max_dd
    FROM rt_daily_summary
    WHERE run_id = $1
  `;
    const result = await pool.query(query, [runId]);
    return Number(result.rows[0].max_dd);
}
export async function updateDailySummary(runId, tradingDate, summary) {
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

import { Pool } from 'pg';
import type {
  Candle,
  TradeRun,
  Position,
  Trade,
  SignalLog,
  DatabaseOperations
} from '../types.js';

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
      symbol: row.symbol,
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
export async function getActiveRuns(): Promise<TradeRun[]> {
  const query = `
    SELECT * FROM ft_runs
    WHERE status IN ('active', 'winding_down')
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query);
  return result.rows.map(row => ({
    ...row,
    params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params
  }));
}

// Get live prices from database
export async function getLivePrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT DISTINCT ON (symbol) symbol, close
    FROM ohlcv_1m
    WHERE symbol IN (${placeholders})
    ORDER BY symbol, ts DESC
  `;

  const result = await pool.query(query, symbols);
  const prices: Record<string, number> = {};

  for (const row of result.rows) {
    prices[row.symbol] = Number(row.close);
  }

  return prices;
}

// Get recent candles for analysis
export async function getRecentCandles(
  symbols: string[],
  lookbackMinutes: number = 60,
  timeframe: string = '1m'
): Promise<Record<string, Candle[]>> {
  if (symbols.length === 0) return {};

  const timeframeMinutes = getTimeframeMinutes(timeframe as Timeframe) || 1;
  const lookbackTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT *
    FROM ohlcv_${timeframe}
    WHERE symbol IN (${placeholders})
      AND ts >= $${symbols.length + 1}
    ORDER BY symbol, ts ASC
  `;

  const result = await pool.query(query, [...symbols, lookbackTime.toISOString()]);
  return processCandlesResult(result, symbols);
}

// Get current candles (latest for each symbol)
export async function getCurrentCandles(symbols: string[]): Promise<Record<string, Candle>> {
  if (symbols.length === 0) return {};

  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT DISTINCT ON (symbol) *
    FROM ohlcv_1m
    WHERE symbol IN (${placeholders})
    ORDER BY symbol, ts DESC
  `;

  const result = await pool.query(query, symbols);
  const candles: Record<string, Candle> = {};

  for (const row of result.rows) {
    candles[row.symbol] = {
      ts: row.ts,
      symbol: row.symbol,
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
      bb_upper: row.bb_upper,
      bb_lower: row.bb_lower,
      bb_basis: row.bb_basis,
      vol_avg_20: row.vol_avg_20,
      vol_mult: row.vol_mult,
      book_imb: row.book_imb,
      spread_bps: row.spread_bps
    };
  }

  return candles;
}

// Update last processed candle timestamp
export async function updateLastProcessedCandle(runId: string, symbol: string, timestamp: string): Promise<void> {
  await pool.query(`
    INSERT INTO ft_last_processed_candles (run_id, symbol, last_ts)
    VALUES ($1, $2, $3)
    ON CONFLICT (run_id, symbol)
    DO UPDATE SET last_ts = $3, updated_at = NOW()
  `, [runId, symbol, timestamp]);
}

// Get last processed candle timestamp
export async function getLastProcessedCandle(runId: string, symbol: string): Promise<string | null> {
  const result = await pool.query(`
    SELECT last_ts FROM ft_last_processed_candles
    WHERE run_id = $1 AND symbol = $2
  `, [runId, symbol]);

  return result.rows[0]?.last_ts || null;
}

// Get current positions for a run
export async function getCurrentPositions(runId: string): Promise<Position[]> {
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
    current_price: Number(row.current_price),
    unrealized_pnl: Number(row.unrealized_pnl),
    cost_basis: Number(row.cost_basis),
    market_value: Number(row.market_value),
    stop_loss: row.stop_loss ? Number(row.stop_loss) : undefined,
    take_profit: row.take_profit ? Number(row.take_profit) : undefined,
    leverage: Number(row.leverage)
  }));
}

// Create a new trade
export async function createTrade(trade: Omit<Trade, 'trade_id'>): Promise<string> {
  const query = `
    INSERT INTO ft_trades (
      run_id, symbol, side, entry_ts, qty, entry_px, realized_pnl,
      unrealized_pnl, fees, binance_order_id, binance_client_order_id,
      reason, leverage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING trade_id
  `;

  const values = [
    trade.run_id,
    trade.symbol,
    trade.side,
    trade.entry_ts,
    trade.qty,
    trade.entry_px,
    trade.realized_pnl,
    trade.unrealized_pnl,
    trade.fees,
    trade.binance_order_id,
    trade.binance_client_order_id,
    trade.reason,
    trade.leverage,
    trade.status
  ];

  const result = await pool.query(query, values);
  return result.rows[0].trade_id;
}

// Create a new position
export async function createPosition(position: Omit<Position, 'position_id'>): Promise<string> {
  const query = `
    INSERT INTO ft_positions (
      run_id, symbol, side, size, entry_price, current_price,
      unrealized_pnl, cost_basis, market_value, stop_loss, take_profit,
      leverage, binance_position_side, binance_margin_type, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING position_id
  `;

  const values = [
    position.run_id,
    position.symbol,
    position.side,
    position.size,
    position.entry_price,
    position.current_price,
    position.unrealized_pnl,
    position.cost_basis,
    position.market_value,
    position.stop_loss,
    position.take_profit,
    position.leverage,
    position.binance_position_side,
    position.binance_margin_type,
    position.status
  ];

  const result = await pool.query(query, values);
  return result.rows[0].position_id;
}

// Update position with current market data
export async function updatePosition(
  positionId: string,
  currentPrice: number,
  unrealizedPnl: number,
  marketValue: number
): Promise<void> {
  await pool.query(`
    UPDATE ft_positions
    SET current_price = $2, unrealized_pnl = $3, market_value = $4, last_update = NOW()
    WHERE position_id = $1
  `, [positionId, currentPrice, unrealizedPnl, marketValue]);
}

// Close a position
export async function closePosition(positionId: string, exitPrice: number, realizedPnl: number): Promise<void> {
  await pool.query(`
    UPDATE ft_positions
    SET status = 'closed', closed_at = NOW(), exit_price = $2, realized_pnl = $3
    WHERE position_id = $1
  `, [positionId, exitPrice, realizedPnl]);
}

// Log trading signal
export async function logSignal(signal: Omit<SignalLog, 'signal_id'>): Promise<void> {
  const query = `
    INSERT INTO ft_signals (
      run_id, symbol, signal_type, side, size, price, candle_data,
      strategy_state, executed, executed_at, execution_price,
      execution_notes, binance_order_id, binance_response, rejection_reason, signal_ts
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  `;

  const values = [
    signal.run_id,
    signal.symbol,
    signal.signal_type,
    signal.side,
    signal.size,
    signal.price,
    signal.candle_data ? JSON.stringify(signal.candle_data) : null,
    signal.strategy_state ? JSON.stringify(signal.strategy_state) : null,
    signal.executed,
    signal.executed_at,
    signal.execution_price,
    signal.execution_notes,
    signal.binance_order_id,
    signal.binance_response ? JSON.stringify(signal.binance_response) : null,
    signal.rejection_reason,
    signal.signal_ts
  ];

  await pool.query(query, values);
}

// Update run status
export async function updateRunStatus(runId: string, status: string, error?: string): Promise<void> {
  await pool.query(`
    UPDATE ft_runs
    SET status = $2, error = $3, last_update = NOW()
    WHERE run_id = $1
  `, [runId, status, error || null]);
}

// Get all trades for a run
export async function getTrades(runId: string): Promise<Trade[]> {
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
    realized_pnl: Number(row.realized_pnl),
    unrealized_pnl: Number(row.unrealized_pnl),
    fees: Number(row.fees),
    leverage: Number(row.leverage),
    binance_order_id: row.binance_order_id ? Number(row.binance_order_id) : undefined
  }));
}

// Update run capital
export async function updateRunCapital(runId: string, currentCapital: number): Promise<void> {
  await pool.query(`
    UPDATE ft_runs
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `, [runId, currentCapital]);
}

// Risk management functions
export async function getTodaysPnL(runId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await pool.query(`
    SELECT COALESCE(SUM(realized_pnl), 0) as todays_pnl
    FROM ft_trades
    WHERE run_id = $1 AND entry_ts >= $2 AND status = 'closed'
  `, [runId, today.toISOString()]);

  return Number(result.rows[0].todays_pnl);
}

export async function getMaxDrawdown(runId: string): Promise<number> {
  const result = await pool.query(`
    SELECT COALESCE(MIN(current_capital), 0) as min_capital,
           (SELECT starting_capital FROM ft_runs WHERE run_id = $1) as starting_capital
    FROM ft_runs
    WHERE run_id = $1
  `, [runId]);

  const row = result.rows[0];
  const minCapital = Number(row.min_capital);
  const startingCapital = Number(row.starting_capital);

  if (minCapital >= startingCapital) return 0;

  return ((startingCapital - minCapital) / startingCapital) * 100;
}

// Export all functions as a single object for easier importing
export const databaseOperations: DatabaseOperations = {
  testConnection,
  getActiveRuns,
  getCurrentPositions,
  getTrades,
  getTodaysPnL,
  getMaxDrawdown,
  getCurrentCandles,
  getRecentCandles,
  getLivePrices,
  getLastProcessedCandle,
  updateLastProcessedCandle,
  createTrade,
  createPosition,
  updatePosition,
  closePosition,
  logSignal,
  updateRunStatus,
  updateRunCapital,
  pool
};

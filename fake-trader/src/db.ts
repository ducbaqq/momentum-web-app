import { 
  createPool,
  testConnection as sharedTestConnection,
  getRecentCandles as sharedGetRecentCandles,
  getLivePrices as sharedGetLivePrices,
  Candle
} from 'trading-shared';
import type { FakeTradeRun, FakeTrade, FakePosition, FakeSignal } from './types.js';

// Initialize database connection
export const pool = createPool();

// Re-export shared functions
export const testConnection = () => sharedTestConnection(pool);
export const getRecentCandles = (symbols: string[], lookbackMinutes?: number) => 
  sharedGetRecentCandles(pool, symbols, lookbackMinutes);
export const getLivePrices = (symbols: string[]) => sharedGetLivePrices(pool, symbols);

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

// Get current positions for a run
export async function getCurrentPositions(runId: string): Promise<FakePosition[]> {
  const query = `
    SELECT * FROM ft_positions 
    WHERE run_id = $1 AND status = 'open'
    ORDER BY created_at DESC
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

// Create a new trade
export async function createTrade(trade: Omit<FakeTrade, 'trade_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_trades (run_id, symbol, side, entry_ts, exit_ts, qty, entry_px, exit_px, 
                          realized_pnl, unrealized_pnl, fees, reason, leverage, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING trade_id
  `;
  
  const values = [
    trade.run_id, trade.symbol, trade.side, trade.entry_ts, trade.exit_ts,
    trade.qty, trade.entry_px, trade.exit_px, trade.realized_pnl, trade.unrealized_pnl,
    trade.fees, trade.reason, trade.leverage, trade.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].trade_id;
}

// Create a new position
export async function createPosition(position: Omit<FakePosition, 'position_id' | 'created_at' | 'last_update'>): Promise<string> {
  const query = `
    INSERT INTO ft_positions (run_id, symbol, side, size, entry_price, current_price, 
                             unrealized_pnl, cost_basis, market_value, stop_loss, take_profit, 
                             leverage, opened_at, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING position_id
  `;
  
  const values = [
    position.run_id, position.symbol, position.side, position.size, position.entry_price,
    position.current_price, position.unrealized_pnl, position.cost_basis, position.market_value,
    position.stop_loss, position.take_profit, position.leverage, position.opened_at, position.status
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].position_id;
}

// Update a position (legacy signature for compatibility)
export async function updatePosition(positionId: string, currentPrice: number, unrealizedPnl: number, marketValue: number): Promise<void> {
  const query = `
    UPDATE ft_positions 
    SET current_price = $2, unrealized_pnl = $3, market_value = $4, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, currentPrice, unrealizedPnl, marketValue]);
}

// Update a position with object parameter (new signature)
export async function updatePositionObj(positionId: string, updates: Partial<Pick<FakePosition, 'current_price' | 'unrealized_pnl' | 'market_value' | 'status'>>): Promise<void> {
  const updateFields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;
  
  if (updates.current_price !== undefined) {
    updateFields.push(`current_price = $${paramCount++}`);
    values.push(updates.current_price);
  }
  
  if (updates.unrealized_pnl !== undefined) {
    updateFields.push(`unrealized_pnl = $${paramCount++}`);
    values.push(updates.unrealized_pnl);
  }
  
  if (updates.market_value !== undefined) {
    updateFields.push(`market_value = $${paramCount++}`);
    values.push(updates.market_value);
  }
  
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramCount++}`);
    values.push(updates.status);
  }
  
  updateFields.push(`last_update = NOW()`);
  values.push(positionId);
  
  const query = `
    UPDATE ft_positions 
    SET ${updateFields.join(', ')}
    WHERE position_id = $${paramCount}
  `;
  
  await pool.query(query, values);
}

// Close a position
export async function closePosition(positionId: string, exitPrice: number, realizedPnl: number): Promise<void> {
  const query = `
    UPDATE ft_positions 
    SET status = 'closed', current_price = $2, unrealized_pnl = 0, 
        market_value = 0, last_update = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(query, [positionId, exitPrice]);
}

// Log a signal
export async function logSignal(signal: Omit<FakeSignal, 'signal_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_signals (run_id, symbol, signal_type, side, size, price, candle_data, 
                           strategy_state, rejection_reason, executed, execution_price, 
                           execution_notes, signal_ts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING signal_id
  `;
  
  const values = [
    signal.run_id, signal.symbol, signal.signal_type, signal.side, signal.size,
    signal.price, JSON.stringify(signal.candle_data), JSON.stringify(signal.strategy_state),
    signal.rejection_reason, signal.executed, signal.execution_price, signal.execution_notes,
    signal.signal_ts
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].signal_id;
}

// Update run status (legacy signature for compatibility)
export async function updateRunStatus(runId: string, status: string, error?: string): Promise<void> {
  if (error) {
    const query = `
      UPDATE ft_runs 
      SET status = $2, error = $3, last_update = NOW()
      WHERE run_id = $1
    `;
    await pool.query(query, [runId, status, error]);
  } else {
    const query = `
      UPDATE ft_runs 
      SET status = $2, last_update = NOW()
      WHERE run_id = $1
    `;
    await pool.query(query, [runId, status]);
  }
}

// Update run capital
export async function updateRunCapital(runId: string, newCapital: number): Promise<void> {
  const query = `
    UPDATE ft_runs 
    SET current_capital = $2, last_update = NOW()
    WHERE run_id = $1
  `;
  
  await pool.query(query, [runId, newCapital]);
}

// Get today's PnL
export async function getTodaysPnL(runId: string): Promise<number> {
  const query = `
    SELECT COALESCE(SUM(realized_pnl), 0) as total_pnl
    FROM ft_trades 
    WHERE run_id = $1 AND DATE(entry_ts) = CURRENT_DATE
  `;
  
  const result = await pool.query(query, [runId]);
  return Number(result.rows[0].total_pnl);
}

// Get maximum drawdown
export async function getMaxDrawdown(runId: string): Promise<number> {
  const query = `
    SELECT 
      starting_capital,
      MIN(current_capital) as lowest_capital
    FROM ft_runs 
    WHERE run_id = $1
    GROUP BY starting_capital
  `;
  
  const result = await pool.query(query, [runId]);
  if (result.rows.length === 0) return 0;
  
  const { starting_capital, lowest_capital } = result.rows[0];
  const maxDrawdownPct = ((starting_capital - lowest_capital) / starting_capital) * 100;
  return Math.max(0, maxDrawdownPct);
}

// Legacy function for backward compatibility - alias for getRecentCandles
export async function getCurrentCandles(symbols: string[]): Promise<Record<string, Candle>> {
  const candles = await getRecentCandles(symbols, 1); // Get most recent candle
  const result: Record<string, Candle> = {};
  
  for (const [symbol, candleArray] of Object.entries(candles)) {
    if (candleArray.length > 0) {
      result[symbol] = candleArray[candleArray.length - 1]; // Get the latest candle
    }
  }
  
  return result;
}

// Placeholder functions for features that might be used by fake trader but aren't needed with 1m candles
export async function getCompleted15mCandles(symbols: string[]): Promise<Record<string, Candle[]>> {
  console.log('⚠️ getCompleted15mCandles is deprecated - using 1m candles instead');
  return await getRecentCandles(symbols, 60);
}

export async function hasNew15mCandles(symbols: string[]): Promise<boolean> {
  console.log('⚠️ hasNew15mCandles is deprecated with 1m candle approach');
  return true; // Always return true since we process every minute
}

export async function getLastProcessedCandle(runId: string): Promise<string | null> {
  console.log('⚠️ getLastProcessedCandle is deprecated with 1m candle approach');
  return null;
}

export async function updateLastProcessedCandle(runId: string, timestamp: string): Promise<void> {
  console.log('⚠️ updateLastProcessedCandle is deprecated with 1m candle approach');
  // No-op since we don't track processed candles with the new approach
}
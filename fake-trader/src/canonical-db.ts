// Canonical Data Model Database Functions
// This file contains functions for working with the Order/Fill/Position model

import type { Order, Fill, PositionV2, AccountSnapshot, PriceSnapshot } from './types.js';
import { pool } from './db.js';

// ============================================================================
// Order Operations
// ============================================================================

export async function createOrder(order: Omit<Order, 'order_id' | 'created_at' | 'updated_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_orders (
      position_id, run_id, symbol, ts, side, type, qty, price, status, reason_tag, rejection_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING order_id
  `;
  
  const values = [
    order.position_id || null,
    order.run_id,
    order.symbol,
    order.ts,
    order.side,
    order.type,
    order.qty,
    order.price || null,
    order.status,
    order.reason_tag || null,
    order.rejection_reason || null,
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].order_id;
}

export async function updateOrderStatus(orderId: string, status: Order['status'], rejectionReason?: string): Promise<void> {
  // Validate state transition
  const currentOrder = await pool.query('SELECT status FROM ft_orders WHERE order_id = $1', [orderId]);
  if (currentOrder.rows.length === 0) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  const currentStatus = currentOrder.rows[0].status;
  
  // Validate FSM transitions
  const validTransitions: Record<string, string[]> = {
    'NEW': ['PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
    'PARTIAL': ['FILLED', 'CANCELLED'],
    'FILLED': [], // Terminal state
    'CANCELLED': [], // Terminal state
    'REJECTED': [], // Terminal state
  };
  
  if (!validTransitions[currentStatus]?.includes(status)) {
    throw new Error(`Invalid order status transition: ${currentStatus} → ${status}`);
  }
  
  const query = `
    UPDATE ft_orders 
    SET status = $2, rejection_reason = $3, updated_at = NOW()
    WHERE order_id = $1
  `;
  
  await pool.query(query, [orderId, status, rejectionReason || null]);
}

/**
 * Update order status based on fills (Order FSM)
 * NEW → PARTIAL → FILLED
 * NEW → CANCELLED
 * NEW → REJECTED
 */
export async function updateOrderStatusFromFills(orderId: string): Promise<{ oldStatus: string; newStatus: string } | null> {
  // Get order details
  const orderResult = await pool.query('SELECT qty, status FROM ft_orders WHERE order_id = $1', [orderId]);
  if (orderResult.rows.length === 0) return null;
  
  const order = orderResult.rows[0];
  const orderQty = Number(order.qty);
  const currentStatus = order.status;
  
  // If order is already terminal, don't update
  if (['FILLED', 'CANCELLED', 'REJECTED'].includes(currentStatus)) {
    return null;
  }
  
  // Get total filled quantity
  const fillsResult = await pool.query(
    'SELECT SUM(qty) as total_filled FROM ft_fills WHERE order_id = $1',
    [orderId]
  );
  
  const totalFilled = Number(fillsResult.rows[0]?.total_filled || 0);
  
  // Determine new status based on fills
  let newStatus = currentStatus;
  if (totalFilled >= orderQty) {
    // Fully filled
    if (currentStatus !== 'FILLED') {
      newStatus = 'FILLED';
      await updateOrderStatus(orderId, 'FILLED');
    }
  } else if (totalFilled > 0) {
    // Partially filled
    if (currentStatus !== 'PARTIAL') {
      newStatus = 'PARTIAL';
      await updateOrderStatus(orderId, 'PARTIAL');
    }
  }
  // If totalFilled === 0, order remains NEW
  
  return newStatus !== currentStatus ? { oldStatus: currentStatus, newStatus } : null;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const query = 'SELECT * FROM ft_orders WHERE order_id = $1';
  const result = await pool.query(query, [orderId]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    position_id: row.position_id || undefined,
    price: row.price ? Number(row.price) : undefined,
    qty: Number(row.qty),
    reason_tag: row.reason_tag || undefined,
    rejection_reason: row.rejection_reason || undefined,
  };
}

export async function getFill(fillId: string): Promise<Fill | null> {
  const query = 'SELECT * FROM ft_fills WHERE fill_id = $1';
  const result = await pool.query(query, [fillId]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    position_id: row.position_id || undefined,
    qty: Number(row.qty),
    price: Number(row.price),
    fee: Number(row.fee),
  };
}

export async function linkOrderToPosition(orderId: string, positionId: string): Promise<void> {
  const query = `
    UPDATE ft_orders 
    SET position_id = $2, updated_at = NOW()
    WHERE order_id = $1
  `;
  
  await pool.query(query, [orderId, positionId]);
}

// ============================================================================
// Fill Operations
// ============================================================================

export async function createFill(fill: Omit<Fill, 'fill_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_fills (
      order_id, position_id, run_id, symbol, ts, qty, price, fee
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING fill_id
  `;
  
  const values = [
    fill.order_id,
    fill.position_id || null,
    fill.run_id,
    fill.symbol,
    fill.ts,
    fill.qty,
    fill.price,
    fill.fee,
  ];
  
  const result = await pool.query(query, values);
  const fillId = result.rows[0].fill_id;
  
  // Update order status based on fills (Order FSM)
  await updateOrderStatusFromFills(fill.order_id);
  
  return fillId;
}

export async function getPositionV2(positionId: string): Promise<PositionV2 | null> {
  const query = 'SELECT * FROM ft_positions_v2 WHERE position_id = $1';
  const result = await pool.query(query, [positionId]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    close_ts: row.close_ts || undefined,
    entry_price_vwap: row.entry_price_vwap ? Number(row.entry_price_vwap) : undefined,
    exit_price_vwap: row.exit_price_vwap ? Number(row.exit_price_vwap) : undefined,
    quantity_open: Number(row.quantity_open),
    quantity_close: Number(row.quantity_close),
    cost_basis: Number(row.cost_basis),
    fees_total: Number(row.fees_total),
    realized_pnl: Number(row.realized_pnl),
    leverage_effective: Number(row.leverage_effective),
  };
}

export async function getFillsForPosition(positionId: string): Promise<Fill[]> {
  const query = `
    SELECT * FROM ft_fills
    WHERE position_id = $1
    ORDER BY ts ASC
  `;
  
  const result = await pool.query(query, [positionId]);
  return result.rows.map(row => ({
    ...row,
    position_id: row.position_id || undefined,
    qty: Number(row.qty),
    price: Number(row.price),
    fee: Number(row.fee),
  }));
}

export async function getFillsForOrder(orderId: string): Promise<Fill[]> {
  const query = `
    SELECT * FROM ft_fills
    WHERE order_id = $1
    ORDER BY ts ASC
  `;
  
  const result = await pool.query(query, [orderId]);
  return result.rows.map(row => ({
    ...row,
    position_id: row.position_id || undefined,
    qty: Number(row.qty),
    price: Number(row.price),
    fee: Number(row.fee),
  }));
}

// ============================================================================
// Position V2 Operations
// ============================================================================

export async function createPositionV2(position: Omit<PositionV2, 'position_id' | 'created_at' | 'updated_at'>): Promise<string> {
  // Ensure position starts in NEW state (Position FSM: NEW → OPEN → CLOSED)
  const status = position.status || 'NEW';
  
  const query = `
    INSERT INTO ft_positions_v2 (
      run_id, symbol, side, status, open_ts, close_ts, entry_price_vwap, exit_price_vwap,
      quantity_open, quantity_close, cost_basis, fees_total, realized_pnl, leverage_effective
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING position_id
  `;
  
  const values = [
    position.run_id,
    position.symbol,
    position.side,
    status,
    position.open_ts,
    position.close_ts || null,
    position.entry_price_vwap || null,
    position.exit_price_vwap || null,
    position.quantity_open,
    position.quantity_close,
    position.cost_basis,
    position.fees_total,
    position.realized_pnl, // Will be recomputed from fills
    position.leverage_effective,
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].position_id;
}

/**
 * Get all open positions for a run (status IN ('NEW', 'OPEN'))
 */
export async function getOpenPositionsV2(runId: string): Promise<PositionV2[]> {
  const query = `
    SELECT * FROM ft_positions_v2
    WHERE run_id = $1 AND status IN ('NEW', 'OPEN')
    ORDER BY open_ts DESC
  `;
  
  const result = await pool.query(query, [runId]);
  return result.rows.map(row => ({
    ...row,
    close_ts: row.close_ts || undefined,
    entry_price_vwap: row.entry_price_vwap ? Number(row.entry_price_vwap) : undefined,
    exit_price_vwap: row.exit_price_vwap ? Number(row.exit_price_vwap) : undefined,
    quantity_open: Number(row.quantity_open),
    quantity_close: Number(row.quantity_close),
    cost_basis: Number(row.cost_basis),
    fees_total: Number(row.fees_total),
    realized_pnl: Number(row.realized_pnl),
    leverage_effective: Number(row.leverage_effective),
  }));
}

export async function getOpenPositionV2BySymbol(runId: string, symbol: string): Promise<PositionV2 | null> {
  const query = `
    SELECT * FROM ft_positions_v2
    WHERE run_id = $1 AND symbol = $2 AND status IN ('NEW', 'OPEN')
    ORDER BY open_ts DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [runId, symbol]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    close_ts: row.close_ts || undefined,
    entry_price_vwap: row.entry_price_vwap ? Number(row.entry_price_vwap) : undefined,
    exit_price_vwap: row.exit_price_vwap ? Number(row.exit_price_vwap) : undefined,
    quantity_open: Number(row.quantity_open),
    quantity_close: Number(row.quantity_close),
    cost_basis: Number(row.cost_basis),
    fees_total: Number(row.fees_total),
    realized_pnl: Number(row.realized_pnl),
    leverage_effective: Number(row.leverage_effective),
  };
}

/**
 * Get all open positions for a symbol (for multi-mode support)
 */
export async function getOpenPositionsV2BySymbol(runId: string, symbol: string): Promise<PositionV2[]> {
  const query = `
    SELECT * FROM ft_positions_v2
    WHERE run_id = $1 AND symbol = $2 AND status IN ('NEW', 'OPEN')
    ORDER BY open_ts DESC
  `;
  
  const result = await pool.query(query, [runId, symbol]);
  return result.rows.map(row => ({
    ...row,
    close_ts: row.close_ts || undefined,
    entry_price_vwap: row.entry_price_vwap ? Number(row.entry_price_vwap) : undefined,
    exit_price_vwap: row.exit_price_vwap ? Number(row.exit_price_vwap) : undefined,
    quantity_open: Number(row.quantity_open),
    quantity_close: Number(row.quantity_close),
    cost_basis: Number(row.cost_basis),
    fees_total: Number(row.fees_total),
    realized_pnl: Number(row.realized_pnl),
    leverage_effective: Number(row.leverage_effective),
  }));
}

/**
 * Check if there's an overlapping position (opposite side) for the same symbol
 * This prevents LONG and SHORT positions for the same symbol in the same run
 */
export async function hasOverlappingPosition(runId: string, symbol: string, side: 'LONG' | 'SHORT'): Promise<boolean> {
  const oppositeSide = side === 'LONG' ? 'SHORT' : 'LONG';
  const query = `
    SELECT COUNT(*) as count
    FROM ft_positions_v2
    WHERE run_id = $1 
      AND symbol = $2 
      AND side = $3
      AND status IN ('NEW', 'OPEN')
  `;
  
  const result = await pool.query(query, [runId, symbol, oppositeSide]);
  return Number(result.rows[0]?.count || 0) > 0;
}

export async function updatePositionFromFills(positionId: string): Promise<{ oldStatus: string; newStatus: string; statusChanged: boolean }> {
  // Compute position metrics from fills
  const fills = await getFillsForPosition(positionId);
  
  if (fills.length === 0) {
    // Return default if no fills
    const positionQuery = await pool.query('SELECT status FROM ft_positions_v2 WHERE position_id = $1', [positionId]);
    if (positionQuery.rows.length === 0) {
      throw new Error(`Position ${positionId} not found`);
    }
    const currentStatus = positionQuery.rows[0].status;
    return { oldStatus: currentStatus, newStatus: currentStatus, statusChanged: false };
  }
  
  // Get position details
  const positionQuery = await pool.query('SELECT * FROM ft_positions_v2 WHERE position_id = $1', [positionId]);
  if (positionQuery.rows.length === 0) {
    throw new Error(`Position ${positionId} not found`);
  }
  
  const position = positionQuery.rows[0];
  const side = position.side;
  const currentStatus = position.status;
  
  // Get order types for all fills
  const orderTypes = new Map<string, string>();
  for (const fill of fills) {
    const orderResult = await pool.query('SELECT type FROM ft_orders WHERE order_id = $1', [fill.order_id]);
    if (orderResult.rows.length > 0) {
      orderTypes.set(fill.order_id, orderResult.rows[0].type);
    }
  }
  
  // Separate entry and exit fills
  const entryFills = fills.filter(f => orderTypes.get(f.order_id) === 'ENTRY');
  const exitFills = fills.filter(f => orderTypes.get(f.order_id) === 'EXIT');
  
  // Calculate VWAP entry price from entry fills
  let entryVwap = null;
  let quantityOpen = 0;
  let costBasis = 0;
  let feesTotal = 0;
  
  for (const fill of fills) {
    feesTotal += Number(fill.fee);
    const orderType = orderTypes.get(fill.order_id);
    
    if (orderType === 'ENTRY') {
      quantityOpen += Number(fill.qty);
      costBasis += Number(fill.qty) * Number(fill.price);
    } else if (orderType === 'EXIT') {
      quantityOpen -= Number(fill.qty);
    }
  }
  
  if (entryFills.length > 0) {
    const totalQty = entryFills.reduce((sum, f) => sum + Number(f.qty), 0);
    const totalCost = entryFills.reduce((sum, f) => sum + Number(f.qty) * Number(f.price), 0);
    if (totalQty > 0) {
      entryVwap = totalCost / totalQty;
    }
  }
  
  // Calculate realized PnL from exit fills using VWAPs
  // PnL and Fees Rule: Realized PnL calculated at exit from VWAPs
  // Formula: (exit_vwap - entry_vwap) * quantity - exit_fees
  // Entry fees are already accounted for in cost_basis
  let realizedPnl = 0;
  if (exitFills.length > 0 && entryVwap) {
    // Calculate exit VWAP from exit fills
    const exitTotalQty = exitFills.reduce((sum, f) => sum + Number(f.qty), 0);
    const exitTotalValue = exitFills.reduce((sum, f) => sum + Number(f.qty) * Number(f.price), 0);
    const exitVwap = exitTotalQty > 0 ? exitTotalValue / exitTotalQty : null;
    
    if (exitVwap) {
      // Calculate realized PnL: (exit_vwap - entry_vwap) * quantity - exit_fees
      const exitQuantity = exitFills.reduce((sum, f) => sum + Number(f.qty), 0);
      const exitFees = exitFills.reduce((sum, f) => sum + Number(f.fee), 0);
      
      if (side === 'LONG') {
        realizedPnl = exitQuantity * (exitVwap - entryVwap) - exitFees;
      } else {
        realizedPnl = exitQuantity * (entryVwap - exitVwap) - exitFees;
      }
    }
  }
  
  // Position FSM: NEW → OPEN → CLOSED
  let newStatus = currentStatus;
  let statusChanged = false;
  
  // Transition: NEW → OPEN (when first fill happens)
  if (currentStatus === 'NEW' && fills.length > 0) {
    newStatus = 'OPEN';
    statusChanged = true;
  }
  
  // Transition: OPEN → CLOSED (when position is flat after exit fills)
  if (currentStatus === 'OPEN' && quantityOpen <= 0 && exitFills.length > 0) {
    newStatus = 'CLOSED';
    statusChanged = true;
  }
  
  // Update position
  const updateQuery = `
    UPDATE ft_positions_v2 
    SET 
      entry_price_vwap = $2,
      quantity_open = $3,
      cost_basis = $4,
      fees_total = $5,
      realized_pnl = $6,
      status = $7,
      updated_at = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(updateQuery, [
    positionId,
    entryVwap,
    quantityOpen,
    costBasis,
    feesTotal,
    realizedPnl,
    newStatus,
  ]);
  
  return { oldStatus: currentStatus, newStatus, statusChanged };
}

export async function closePositionV2(positionId: string, closeTs: string): Promise<void> {
  // First, recompute metrics from fills (this will handle status transitions)
  await updatePositionFromFills(positionId);
  
  // Get updated position to check if it's actually closed
  const positionQuery = await pool.query('SELECT * FROM ft_positions_v2 WHERE position_id = $1', [positionId]);
  if (positionQuery.rows.length === 0) return;
  
  const position = positionQuery.rows[0];
  
  // Calculate exit VWAP from exit fills
  const fills = await getFillsForPosition(positionId);
  
  // Get order types
  const orderTypes = new Map<string, string>();
  for (const fill of fills) {
    const orderResult = await pool.query('SELECT type FROM ft_orders WHERE order_id = $1', [fill.order_id]);
    if (orderResult.rows.length > 0) {
      orderTypes.set(fill.order_id, orderResult.rows[0].type);
    }
  }
  
  const exitFills = fills.filter(f => orderTypes.get(f.order_id) === 'EXIT');
  
  let exitVwap = null;
  if (exitFills.length > 0) {
    const totalQty = exitFills.reduce((sum, f) => sum + Number(f.qty), 0);
    const totalValue = exitFills.reduce((sum, f) => sum + Number(f.qty) * Number(f.price), 0);
    if (totalQty > 0) {
      exitVwap = totalValue / totalQty;
    }
  }
  
  const quantityClose = exitFills.reduce((sum, f) => sum + Number(f.qty), 0);
  
  // Update position with close timestamp and exit VWAP
  // Status transition to CLOSED is handled by updatePositionFromFills
  const updateQuery = `
    UPDATE ft_positions_v2 
    SET 
      status = 'CLOSED',
      close_ts = $2,
      exit_price_vwap = $3,
      quantity_close = $4,
      updated_at = NOW()
    WHERE position_id = $1
  `;
  
  await pool.query(updateQuery, [positionId, closeTs, exitVwap, quantityClose]);
}

// ============================================================================
// Account Snapshot Operations
// ============================================================================

export async function createAccountSnapshot(snapshot: Omit<AccountSnapshot, 'snapshot_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_account_snapshots (
      run_id, ts, equity, cash, margin_used, exposure_gross, exposure_net, open_positions_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING snapshot_id
  `;
  
  const values = [
    snapshot.run_id,
    snapshot.ts,
    snapshot.equity,
    snapshot.cash,
    snapshot.margin_used,
    snapshot.exposure_gross,
    snapshot.exposure_net,
    snapshot.open_positions_count,
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].snapshot_id;
}

export async function getLatestAccountSnapshot(runId: string): Promise<AccountSnapshot | null> {
  const query = `
    SELECT * FROM ft_account_snapshots
    WHERE run_id = $1
    ORDER BY ts DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [runId]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    equity: Number(row.equity),
    cash: Number(row.cash),
    margin_used: Number(row.margin_used),
    exposure_gross: Number(row.exposure_gross),
    exposure_net: Number(row.exposure_net),
    open_positions_count: Number(row.open_positions_count),
  };
}

// ============================================================================
// Price Snapshot Operations
// ============================================================================

export async function createPriceSnapshot(snapshot: Omit<PriceSnapshot, 'snapshot_id' | 'created_at'>): Promise<string> {
  const query = `
    INSERT INTO ft_price_snapshots (run_id, ts, symbol, price)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (run_id, ts, symbol) DO UPDATE SET price = $4
    RETURNING snapshot_id
  `;
  
  const result = await pool.query(query, [snapshot.run_id, snapshot.ts, snapshot.symbol, snapshot.price]);
  return result.rows[0].snapshot_id;
}

export async function getLatestPriceSnapshot(runId: string, symbol: string): Promise<PriceSnapshot | null> {
  const query = `
    SELECT * FROM ft_price_snapshots
    WHERE run_id = $1 AND symbol = $2
    ORDER BY ts DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [runId, symbol]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    ...row,
    price: Number(row.price),
  };
}


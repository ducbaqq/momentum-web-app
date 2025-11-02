// Event Logging Contract
// Structured events for trading system audit trail

import type { Order, Fill, PositionV2, AccountSnapshot } from './types.js';
import { pool } from './db.js';

export type EventType =
  | 'ACCOUNT_SNAPSHOT'
  | 'ORDER_NEW'
  | 'ORDER_UPDATE'
  | 'FILL'
  | 'POSITION_OPENED'
  | 'POSITION_MARK'
  | 'POSITION_CLOSED'
  | 'STRATEGY_NOTE';

export interface TradingEvent {
  event_id: string;
  run_id: string;
  event_type: EventType;
  ts: string;
  payload: Record<string, any>;
  order_id?: string;
  fill_id?: string;
  position_id?: string;
  created_at: string;
}

/**
 * Log a trading event
 */
export async function logEvent(params: {
  run_id: string;
  event_type: EventType;
  ts: string;
  payload: Record<string, any>;
  order_id?: string;
  fill_id?: string;
  position_id?: string;
}): Promise<string> {
  const query = `
    INSERT INTO ft_events (
      run_id, event_type, ts, payload, order_id, fill_id, position_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING event_id
  `;
  
  const values = [
    params.run_id,
    params.event_type,
    params.ts,
    JSON.stringify(params.payload),
    params.order_id || null,
    params.fill_id || null,
    params.position_id || null,
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0].event_id;
}

/**
 * ACCOUNT_SNAPSHOT event
 * Logged when account state is captured
 */
export async function logAccountSnapshot(
  runId: string,
  snapshot: AccountSnapshot,
  markPrice?: Record<string, number>
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'ACCOUNT_SNAPSHOT',
    ts: snapshot.ts,
    payload: {
      equity: snapshot.equity,
      cash: snapshot.cash,
      margin_used: snapshot.margin_used,
      exposure_gross: snapshot.exposure_gross,
      exposure_net: snapshot.exposure_net,
      open_positions_count: snapshot.open_positions_count,
      mark_prices: markPrice,
    },
  });
}

/**
 * ORDER_NEW event
 * Logged when a new order is created
 */
export async function logOrderNew(
  runId: string,
  order: Order
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'ORDER_NEW',
    ts: order.ts,
    payload: {
      order_id: order.order_id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: order.qty,
      price: order.price,
      status: order.status,
      reason_tag: order.reason_tag,
    },
    order_id: order.order_id,
    position_id: order.position_id || undefined,
  });
}

/**
 * ORDER_UPDATE event
 * Logged when order status changes
 */
export async function logOrderUpdate(
  runId: string,
  orderId: string,
  oldStatus: string,
  newStatus: string,
  ts: string,
  rejectionReason?: string
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'ORDER_UPDATE',
    ts,
    payload: {
      order_id: orderId,
      old_status: oldStatus,
      new_status: newStatus,
      rejection_reason: rejectionReason,
    },
    order_id: orderId,
  });
}

/**
 * FILL event
 * Logged when an order is filled
 */
export async function logFill(
  runId: string,
  fill: Fill,
  order?: Order
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'FILL',
    ts: fill.ts,
    payload: {
      fill_id: fill.fill_id,
      order_id: fill.order_id,
      symbol: fill.symbol,
      qty: fill.qty,
      price: fill.price,
      fee: fill.fee,
      order_type: order?.type,
      order_side: order?.side,
    },
    fill_id: fill.fill_id,
    order_id: fill.order_id,
    position_id: fill.position_id || undefined,
  });
}

/**
 * POSITION_OPENED event
 * Logged when a position transitions to OPEN
 */
export async function logPositionOpened(
  runId: string,
  position: PositionV2,
  markPrice?: number
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'POSITION_OPENED',
    ts: position.open_ts,
    payload: {
      position_id: position.position_id,
      symbol: position.symbol,
      side: position.side,
      entry_price_vwap: position.entry_price_vwap,
      quantity_open: position.quantity_open,
      cost_basis: position.cost_basis,
      fees_total: position.fees_total,
      leverage_effective: position.leverage_effective,
      mark_price: markPrice,
    },
    position_id: position.position_id,
  });
}

/**
 * POSITION_MARK event
 * Logged when position is marked to market (price update)
 */
export async function logPositionMark(
  runId: string,
  position: PositionV2,
  markPrice: number,
  unrealizedPnl: number
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'POSITION_MARK',
    ts: new Date().toISOString(),
    payload: {
      position_id: position.position_id,
      symbol: position.symbol,
      side: position.side,
      entry_price_vwap: position.entry_price_vwap,
      mark_price: markPrice,
      quantity_open: position.quantity_open,
      unrealized_pnl: unrealizedPnl,
    },
    position_id: position.position_id,
  });
}

/**
 * POSITION_CLOSED event
 * Logged when a position is closed
 */
export async function logPositionClosed(
  runId: string,
  position: PositionV2,
  markPrice?: number
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'POSITION_CLOSED',
    ts: position.close_ts || new Date().toISOString(),
    payload: {
      position_id: position.position_id,
      symbol: position.symbol,
      side: position.side,
      entry_price_vwap: position.entry_price_vwap,
      exit_price_vwap: position.exit_price_vwap,
      quantity_open: position.quantity_open,
      quantity_close: position.quantity_close,
      realized_pnl: position.realized_pnl,
      fees_total: position.fees_total,
      mark_price: markPrice,
    },
    position_id: position.position_id,
  });
}

/**
 * STRATEGY_NOTE event
 * Logged for strategy decisions, signals, notes
 */
export async function logStrategyNote(
  runId: string,
  ts: string,
  note: string,
  metadata?: Record<string, any>
): Promise<string> {
  return logEvent({
    run_id: runId,
    event_type: 'STRATEGY_NOTE',
    ts,
    payload: {
      note,
      ...metadata,
    },
  });
}


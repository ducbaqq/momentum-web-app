export interface FakeTradeRun {
  run_id: string;
  name: string;
  symbols: string[];
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  params: any;
  seed?: number;
  status: 'active' | 'paused' | 'stopped' | 'error' | 'winding_down';
  
  starting_capital: number;
  current_capital: number;
  max_concurrent_positions: number;
  allow_multiple_positions_per_symbol?: boolean; // Default: false (single position per symbol)
  
  started_at: string;
  last_update?: string;
  stopped_at?: string;
  error?: string;
  created_at: string;
}

export interface FakeTradeResult {
  run_id: string;
  symbol: string;
  
  trades: number;
  wins: number;
  losses: number;
  open_positions: number;
  
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  fees: number;
  
  win_rate: number;
  sharpe: number;
  sortino: number;
  max_dd: number;
  profit_factor: number;
  exposure: number;
  turnover: number;
  
  first_trade_at?: string;
  last_trade_at?: string;
  last_update: string;
}

export interface FakeTrade {
  trade_id: string;
  run_id: string;
  symbol: string;
  
  side: 'LONG' | 'SHORT';
  entry_ts: string;
  exit_ts?: string;
  
  qty: number;
  entry_px: number;
  exit_px?: number;
  
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  
  reason?: string;
  leverage: number;
  status: 'open' | 'closed' | 'error';
  created_at: string;
}

export interface FakePosition {
  position_id: string;
  run_id: string;
  trade_id?: string; // Link to the trade that created this position
  symbol: string;
  
  side: 'LONG' | 'SHORT';
  size: number;
  entry_price: number;
  current_price?: number;
  
  unrealized_pnl: number;
  cost_basis: number;
  market_value?: number;
  
  stop_loss?: number;
  take_profit?: number;
  leverage: number;
  
  opened_at: string;
  last_update: string;
  status: 'open' | 'closing' | 'closed';
}

export interface FakeSignal {
  signal_id: string;
  run_id: string;
  symbol: string;
  
  signal_type: 'entry' | 'exit' | 'adjustment';
  side?: 'LONG' | 'SHORT';
  size?: number;
  price?: number;
  
  candle_data?: any;
  strategy_state?: any;
  rejection_reason?: string;
  
  executed: boolean;
  execution_price?: number;
  execution_notes?: string;
  
  signal_ts: string;
  created_at: string;
}

export interface Candle {
  ts: string; // ISO timestamp string, matches database timestamp format
  symbol?: string; // Optional: symbol for multi-asset contexts
  open: number; 
  high: number; 
  low: number; 
  close: number; 
  volume: number;
  
  // Technical features from features_1m table
  roc_1m?: number | null;
  roc_5m?: number | null;
  roc_15m?: number | null;
  roc_30m?: number | null;
  roc_1h?: number | null;
  roc_4h?: number | null;
  rsi_14?: number | null;
  ema_12?: number | null; // Added missing ema_12
  ema_20?: number | null;
  ema_26?: number | null; // Added missing ema_26
  ema_50?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  bb_upper?: number | null;
  bb_lower?: number | null;
  bb_basis?: number | null; // Added missing bb_basis
  vol_avg_20?: number | null;
  vol_mult?: number | null;
  book_imb?: number | null;
  spread_bps?: number | null;
  
  // Additional fields that may be present in some queries
  trades_count?: number | null; // From ohlcv_1m table
  vwap_minute?: number | null;  // From ohlcv_1m table
}

// ============================================================================
// Canonical Data Model Types
// ============================================================================

export interface AccountSnapshot {
  snapshot_id: string;
  run_id: string;
  ts: string; // ISO timestamp
  equity: number;
  cash: number;
  margin_used: number;
  exposure_gross: number;
  exposure_net: number;
  open_positions_count: number;
  created_at: string;
}

export interface PositionV2 {
  position_id: string;
  run_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'NEW' | 'OPEN' | 'CLOSED'; // FSM: NEW → OPEN → CLOSED
  open_ts: string;
  close_ts?: string;
  entry_price_vwap?: number;
  exit_price_vwap?: number;
  quantity_open: number;
  quantity_close: number;
  cost_basis: number;
  fees_total: number;
  realized_pnl: number; // Computed from fills, never stored directly
  leverage_effective: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  order_id: string;
  position_id?: string;
  run_id: string;
  symbol: string;
  ts: string; // ISO timestamp
  side: 'LONG' | 'SHORT';
  type: 'ENTRY' | 'EXIT' | 'ADJUST';
  qty: number;
  price?: number; // Intended price (may differ from fill price)
  status: 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  reason_tag?: string; // e.g., 'momentum_breakout_v2_15m', 'stop_loss', 'take_profit'
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface Fill {
  fill_id: string;
  order_id: string;
  position_id?: string;
  run_id: string;
  symbol: string;
  ts: string; // ISO timestamp
  qty: number;
  price: number;
  fee: number;
  created_at: string;
}

export interface PriceSnapshot {
  snapshot_id: string;
  run_id: string;
  ts: string; // ISO timestamp
  symbol: string;
  price: number;
  created_at: string;
}
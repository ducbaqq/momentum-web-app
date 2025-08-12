export type UUID = string;

// Legacy alias for backwards compatibility
export interface RunRow extends Omit<BacktestRunRow, 'name'> {
  name: string | null; // Override to allow null for backwards compatibility
  params: any; // Keep loose typing for backwards compatibility
}

export interface StrategyContext {
  feeBps: number;
  slippageBps: number;
  leverage: number;
  seed: number;
}

export interface Candle {
  ts: string; // ISO timestamp string, matches database timestamp format
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

export interface Trade {
  entryTs: string; exitTs?: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPx: number; exitPx?: number;
  pnl?: number; fees?: number; reason?: string;
}

export interface RunResult {
  trades: Trade[];
  equityCurve: { ts: string; equity: number }[];
  summary: {
    trades: number; wins: number; losses: number;
    pnl: number; fees: number; winRate: number;
    maxDd: number; sharpe: number; sortino: number; profitFactor: number;
    exposure: number; turnover: number;
  };
}

// Database schema types to ensure consistency
export interface OHLCVRow {
  ts: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades_count: number;
  vwap_minute: number;
}

export interface FeaturesRow {
  ts: string;
  symbol: string;
  roc_1m?: number;
  roc_5m?: number;
  roc_15m?: number;
  roc_30m?: number;
  roc_1h?: number;
  roc_4h?: number;
  vol_avg_20?: number;
  vol_mult?: number;
  rsi_14?: number;
  ema_12?: number;
  ema_20?: number;
  ema_26?: number;
  ema_50?: number;
  macd?: number;
  macd_signal?: number;
  bb_basis?: number;
  bb_upper?: number;
  bb_lower?: number;
  book_imb?: number;
  spread_bps?: number;
}

export interface BacktestRunRow {
  run_id: UUID;
  name?: string;
  start_ts: string;
  end_ts: string;
  symbols: string[];
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  params: Record<string, any>;
  seed: number;
  status: 'queued' | 'running' | 'done' | 'error';
  created_at: string;
  error?: string;
}

export interface BacktestResultRow {
  run_id: UUID;
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  fees: number;
  win_rate: number;
  sharpe: number;
  sortino: number;
  max_dd: number;
  profit_factor: number;
  exposure: number;
  turnover: number;
}
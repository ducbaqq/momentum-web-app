// Shared types and interfaces for trading applications

// Binance Enums
export enum SymbolStatus {
  TRADING = 'TRADING',
  END_OF_DAY = 'END_OF_DAY', 
  HALT = 'HALT',
  BREAK = 'BREAK'
}

export enum OrderStatus {
  NEW = 'NEW',
  PENDING_NEW = 'PENDING_NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  PENDING_CANCEL = 'PENDING_CANCEL',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  EXPIRED_IN_MATCH = 'EXPIRED_IN_MATCH'
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP_LOSS = 'STOP_LOSS',
  STOP_LOSS_LIMIT = 'STOP_LOSS_LIMIT',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  LIMIT_MAKER = 'LIMIT_MAKER'
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Canceled
  IOC = 'IOC', // Immediate Or Cancel  
  FOK = 'FOK'  // Fill or Kill
}

export enum OrderResponseType {
  ACK = 'ACK',
  RESULT = 'RESULT',
  FULL = 'FULL'
}

// Shared Candle interface - matches backtest exactly
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
  ema_12?: number | null;
  ema_20?: number | null;
  ema_26?: number | null;
  ema_50?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  bb_upper?: number | null;
  bb_lower?: number | null;
  bb_basis?: number | null;
  vol_avg_20?: number | null;
  vol_mult?: number | null;
  book_imb?: number | null;
  spread_bps?: number | null;
  
  // Additional fields that may be present in some queries
  trades_count?: number | null; // From ohlcv_1m table
  vwap_minute?: number | null;  // From ohlcv_1m table
}

// Base interfaces for positions (specific implementations will extend these)
export interface BasePosition {
  run_id: string;
  symbol: string;
  side: PositionSide | 'LONG' | 'SHORT'; // Allow both for compatibility
  size: number;
  entry_price: number;
  current_price?: number;
  unrealized_pnl: number;
  leverage: number;
  opened_at: string;
  last_update: string;
  status: 'open' | 'closing' | 'closed';
}

// Base interface for trade runs (specific implementations will extend)
export interface BaseTradeRun {
  run_id: string;
  name: string;
  strategy_name: string;
  strategy_version: string;
  symbols: string[];
  starting_capital: number;
  current_capital: number;
  max_concurrent_positions: number;
  params: any;
  status: 'active' | 'paused' | 'stopped' | 'winding_down' | 'completed' | 'error';
  last_update: string;
  created_at: string;
}
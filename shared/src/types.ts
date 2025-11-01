// Unified types for both fake and real trading

export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
  BOTH = 'BOTH'
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT'
}

export interface Candle {
  ts: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  roc_1m?: number;
  roc_5m?: number;
  roc_15m?: number;
  roc_30m?: number;
  roc_1h?: number;
  roc_4h?: number;
  vol_mult?: number;
  vol_avg_20?: number;
  rsi_14?: number;
  bb_upper?: number;
  bb_lower?: number;
  bb_basis?: number;
  spread_bps?: number;
  book_imb?: number;
}

export interface TradeSignal {
  symbol: string;
  side: PositionSide;
  size: number;
  type: OrderType;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  reason: string;
}

export interface StrategyState {
  runId: string;
  symbol: string;
  currentCapital: number;
  positions: Position[];
  lastCandle?: Candle;
  timeframe?: string;
}

export interface Position {
  position_id: string;
  run_id: string;
  symbol: string;
  side: PositionSide;
  size: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  cost_basis: number;
  market_value: number;
  stop_loss?: number;
  take_profit?: number;
  leverage: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  binance_position_side?: string;
  binance_margin_type?: string;
}

export interface Trade {
  trade_id: string;
  run_id: string;
  symbol: string;
  side: PositionSide;
  entry_ts: string;
  qty: number;
  entry_px: number;
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  binance_order_id?: number;
  binance_client_order_id?: string;
  reason: string;
  leverage: number;
  status: 'open' | 'closed';
  exit_ts?: string;
  exit_px?: number;
}

export interface TradeRun {
  run_id: string;
  name: string | null;
  symbols: string[];
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  params: any;
  seed: number;
  status: string;
  starting_capital: number;
  current_capital: number;
  available_funds?: number;
  max_concurrent_positions: number;
  max_position_size_usd?: number;
  daily_loss_limit_pct?: number;
  max_drawdown_pct?: number;
  testnet?: boolean;
  started_at: string;
  last_update: string;
  stopped_at: string | null;
  error: string | null;
  created_at: string;
}

export interface SignalLog {
  signal_id?: string;
  run_id: string;
  symbol: string;
  signal_type: 'entry' | 'exit' | 'adjustment';
  side?: PositionSide;
  size?: number;
  price?: number;
  candle_data?: Candle;
  strategy_state?: any;
  executed: boolean;
  executed_at?: string;
  execution_price?: number;
  execution_notes?: string;
  binance_order_id?: number;
  binance_response?: any;
  rejection_reason?: string;
  signal_ts: string;
}

// Database operation interfaces
export interface DatabaseOperations {
  testConnection(): Promise<void>;
  getActiveRuns(): Promise<TradeRun[]>;
  getCurrentPositions(runId: string): Promise<Position[]>;
  getTrades(runId: string): Promise<Trade[]>;
  getTodaysPnL(runId: string): Promise<number>;
  getMaxDrawdown(runId: string): Promise<number>;
  getCurrentCandles(symbols: string[]): Promise<Record<string, Candle>>;
  getRecentCandles(symbols: string[], minutes: number, timeframe?: string): Promise<Record<string, Candle[]>>;
  getLivePrices(symbols: string[]): Promise<Record<string, number>>;
  getLastProcessedCandle(runId: string, symbol: string): Promise<string | null>;
  updateLastProcessedCandle(runId: string, symbol: string, ts: string): Promise<void>;
  createTrade(trade: Omit<Trade, 'trade_id'>): Promise<string>;
  createPosition(position: Omit<Position, 'position_id'>): Promise<string>;
  updatePosition(positionId: string, currentPrice: number, unrealizedPnl: number, marketValue: number): Promise<void>;
  closePosition(positionId: string, exitPrice: number, realizedPnl: number): Promise<void>;
  logSignal(signal: Omit<SignalLog, 'signal_id'>): Promise<void>;
  updateRunStatus(runId: string, status: string, error?: string): Promise<void>;
  updateRunCapital(runId: string, capital: number): Promise<void>;
  pool: any; // pg.Pool
}

// Trading engine configuration
export interface TradingEngineConfig {
  isRealTrading: boolean;
  binanceConfig?: {
    apiKey: string;
    apiSecret: string;
    testnet: boolean;
  };
}

// Strategy function type
export type StrategyFunction = (
  candle: Candle,
  state: StrategyState,
  params: any
) => TradeSignal[];

// Strategy registry
export interface StrategyRegistry {
  [key: string]: StrategyFunction;
}

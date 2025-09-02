// Binance Enums from enums.md
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

export enum RateLimitType {
  REQUEST_WEIGHT = 'REQUEST_WEIGHT',
  ORDERS = 'ORDERS',
  RAW_REQUESTS = 'RAW_REQUESTS'
}

export enum RateLimitInterval {
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
  DAY = 'DAY'
}

export enum STPMode {
  NONE = 'NONE',
  EXPIRE_MAKER = 'EXPIRE_MAKER',
  EXPIRE_TAKER = 'EXPIRE_TAKER',
  EXPIRE_BOTH = 'EXPIRE_BOTH',
  DECREMENT = 'DECREMENT'
}

// Binance Error Types from errors.md
export interface BinanceError {
  code: number;
  msg: string;
}

export enum BinanceErrorCode {
  // General Server or Network issues (10xx)
  UNKNOWN = -1000,
  DISCONNECTED = -1001,
  UNAUTHORIZED = -1002,
  TOO_MANY_REQUESTS = -1003,
  UNEXPECTED_RESP = -1006,
  TIMEOUT = -1007,
  SERVER_BUSY = -1008,
  INVALID_MESSAGE = -1013,
  UNKNOWN_ORDER_COMPOSITION = -1014,
  TOO_MANY_ORDERS = -1015,
  SERVICE_SHUTTING_DOWN = -1016,
  UNSUPPORTED_OPERATION = -1020,
  INVALID_TIMESTAMP = -1021,
  INVALID_SIGNATURE = -1022,
  
  // Request issues (11xx)
  ILLEGAL_CHARS = -1100,
  TOO_MANY_PARAMETERS = -1101,
  MANDATORY_PARAM_EMPTY_OR_MALFORMED = -1102,
  UNKNOWN_PARAM = -1103,
  UNREAD_PARAMETERS = -1104,
  PARAM_EMPTY = -1105,
  PARAM_NOT_REQUIRED = -1106,
  BAD_PRECISION = -1111,
  NO_DEPTH = -1112,
  TIF_NOT_REQUIRED = -1114,
  INVALID_TIF = -1115,
  INVALID_ORDER_TYPE = -1116,
  INVALID_SIDE = -1117,
  EMPTY_NEW_CL_ORD_ID = -1118,
  EMPTY_ORG_CL_ORD_ID = -1119,
  BAD_INTERVAL = -1120,
  BAD_SYMBOL = -1121,
  
  // Order issues (2xxx)
  NEW_ORDER_REJECTED = -2010,
  CANCEL_REJECTED = -2011,
  ORDER_DOES_NOT_EXIST = -2013,
  BAD_API_KEY_FMT = -2014,
  REJECTED_MBX_KEY = -2015
}

export interface RealTradeRun {
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
  max_position_size_usd: number;
  
  // Risk management
  daily_loss_limit_pct: number;
  max_drawdown_pct: number;
  
  // API configuration
  testnet: boolean;
  
  started_at: string;
  last_update?: string;
  stopped_at?: string;
  error?: string;
  created_at: string;
}

export interface RealTradeResult {
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

export interface RealTrade {
  trade_id: string;
  run_id: string;
  symbol: string;
  
  side: PositionSide;
  entry_ts: string;
  exit_ts?: string;
  
  qty: number;
  entry_px: number;
  exit_px?: number;
  
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  
  // Binance specific
  binance_order_id?: number;
  binance_client_order_id?: string;
  
  reason?: string;
  leverage: number;
  status: 'open' | 'closed' | 'error';
  created_at: string;
}

export interface RealPosition {
  position_id: string;
  run_id: string;
  symbol: string;
  
  side: PositionSide;
  size: number;
  entry_price: number;
  current_price?: number;
  
  unrealized_pnl: number;
  cost_basis: number;
  market_value?: number;
  
  stop_loss?: number;
  take_profit?: number;
  leverage: number;
  
  // Binance specific
  binance_position_side?: PositionSide;
  binance_margin_type?: 'isolated' | 'cross';
  
  opened_at: string;
  last_update: string;
  status: 'open' | 'closing' | 'closed';
}

export interface RealSignal {
  signal_id: string;
  run_id: string;
  symbol: string;
  
  signal_type: 'entry' | 'exit' | 'adjustment';
  side?: PositionSide;
  size?: number;
  price?: number;
  
  candle_data?: any;
  strategy_state?: any;
  rejection_reason?: string;
  
  executed: boolean;
  execution_price?: number;
  execution_notes?: string;
  
  // Binance specific
  binance_order_id?: number;
  binance_response?: any;
  
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

// Binance API types
export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  // WebSocket configuration
  wsConfig?: {
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnects?: number;
    pingInterval?: number;
  };
  // Error handling configuration
  errorConfig?: {
    maxRetries?: number;
    retryDelay?: number;
    enableCircuitBreaker?: boolean;
  };
}

// Position side for futures
export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
  BOTH = 'BOTH'
}

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: OrderStatus;
  timeInForce: TimeInForce;
  type: OrderType;
  side: OrderSide;
  fills: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

export interface BinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
}

export interface BinanceAccountInfo {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  updateTime: number;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: Array<{
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    maintMargin: string;
    initialMargin: string;
    positionInitialMargin: string;
    openOrderInitialMargin: string;
    maxWithdrawAmount: string;
    crossWalletBalance: string;
    crossUnPnl: string;
    availableBalance: string;
  }>;
  positions: BinancePosition[];
}

// WebSocket Stream Types
export interface WebSocketStreamConfig {
  baseUrl: string;
  streams: string[];
  reconnect: boolean;
  reconnectInterval: number;
  maxReconnects: number;
}

export interface MarketStreamData {
  stream: string;
  data: any;
}

export interface UserDataStreamData {
  e: string; // Event type
  E: number; // Event time
  [key: string]: any;
}

export interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(streams: string[]): void;
  unsubscribe(streams: string[]): void;
  onMessage(callback: (data: any) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
}

// Error handling types
export interface ErrorHandler {
  handleBinanceError(error: BinanceError): ErrorHandlingResult;
  shouldRetry(error: BinanceError): boolean;
  getRetryDelay(error: BinanceError, attempt: number): number;
}

export interface ErrorHandlingResult {
  shouldRetry: boolean;
  retryDelay: number;
  logLevel: 'info' | 'warn' | 'error';
  message: string;
}
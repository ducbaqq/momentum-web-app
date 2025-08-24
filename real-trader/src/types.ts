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
  
  side: 'LONG' | 'SHORT';
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
  
  // Binance specific
  binance_position_side?: 'LONG' | 'SHORT';
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
  side?: 'LONG' | 'SHORT';
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
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  
  // Technical indicators
  roc_1m?: number;
  roc_5m?: number;
  roc_15m?: number;
  roc_30m?: number;
  roc_1h?: number;
  roc_4h?: number;
  rsi_14?: number;
  ema_20?: number;
  ema_50?: number;
  ema_200?: number;
  macd?: number;
  macd_signal?: number;
  bb_upper?: number;
  bb_lower?: number;
  vol_avg_20?: number;
  vol_mult?: number;
  book_imb?: number;
  spread_bps?: number;
}

// Binance API types
export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
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
  status: string;
  timeInForce: string;
  type: string;
  side: string;
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
-- Real Trading Tables Schema
-- These tables track live trading runs with Binance Futures integration

-- Real trading runs (similar to bt_runs and ft_runs)
CREATE TABLE IF NOT EXISTS rt_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    symbols TEXT[] NOT NULL,
    timeframe TEXT NOT NULL DEFAULT '15m',
    strategy_name TEXT NOT NULL,
    strategy_version TEXT NOT NULL DEFAULT '1.0',
    params JSONB NOT NULL DEFAULT '{}',
    seed INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'error', 'winding_down')),
    
    -- Trading session info
    starting_capital DECIMAL(20,8) NOT NULL DEFAULT 10000,
    current_capital DECIMAL(20,8) NOT NULL DEFAULT 10000,
    max_concurrent_positions INTEGER DEFAULT 3,
    max_position_size_usd DECIMAL(20,8) DEFAULT 1000,
    
    -- Risk management
    daily_loss_limit_pct DECIMAL(5,2) DEFAULT 5.0,  -- 5% daily loss limit
    max_drawdown_pct DECIMAL(5,2) DEFAULT 10.0,     -- 10% max drawdown limit
    
    -- API configuration
    testnet BOOLEAN NOT NULL DEFAULT true,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_processed_candle TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Real trading results per symbol (similar to bt_results and ft_results)
CREATE TABLE IF NOT EXISTS rt_results (
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Trading statistics
    trades INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    open_positions INTEGER NOT NULL DEFAULT 0,
    
    -- Financial metrics
    realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    fees DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Performance metrics
    win_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    sharpe DECIMAL(10,4) NOT NULL DEFAULT 0,
    sortino DECIMAL(10,4) NOT NULL DEFAULT 0,
    max_dd DECIMAL(5,4) NOT NULL DEFAULT 0,
    profit_factor DECIMAL(10,4) NOT NULL DEFAULT 0,
    exposure DECIMAL(5,4) NOT NULL DEFAULT 0,
    turnover DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Timestamps
    first_trade_at TIMESTAMP WITH TIME ZONE,
    last_trade_at TIMESTAMP WITH TIME ZONE,
    last_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (run_id, symbol)
);

-- Individual real trades (similar to bt_trades and ft_trades)
CREATE TABLE IF NOT EXISTS rt_trades (
    trade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Trade details
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    entry_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_ts TIMESTAMP WITH TIME ZONE,
    
    -- Execution details
    qty DECIMAL(20,8) NOT NULL,
    entry_px DECIMAL(20,8) NOT NULL,
    exit_px DECIMAL(20,8),
    
    -- Financial
    realized_pnl DECIMAL(20,8) DEFAULT 0,
    unrealized_pnl DECIMAL(20,8) DEFAULT 0,
    fees DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Binance specific
    binance_order_id BIGINT,
    binance_client_order_id TEXT,
    
    -- Meta
    reason TEXT,
    leverage DECIMAL(5,2) DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'error')),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Portfolio snapshots over time (similar to bt_equity and ft_equity)
CREATE TABLE IF NOT EXISTS rt_equity (
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Equity breakdown
    cash_balance DECIMAL(20,8) NOT NULL DEFAULT 0,
    position_value DECIMAL(20,8) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    total_equity DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Position info
    open_positions INTEGER NOT NULL DEFAULT 0,
    total_exposure DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    PRIMARY KEY (run_id, symbol, ts)
);

-- Current positions (real-time state)
CREATE TABLE IF NOT EXISTS rt_positions (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Position details
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    size DECIMAL(20,8) NOT NULL,
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8),
    
    -- Financial
    unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    cost_basis DECIMAL(20,8) NOT NULL,
    market_value DECIMAL(20,8),
    
    -- Risk management
    stop_loss DECIMAL(20,8),
    take_profit DECIMAL(20,8),
    leverage DECIMAL(5,2) DEFAULT 1,
    
    -- Binance specific
    binance_position_side TEXT CHECK (binance_position_side IN ('LONG', 'SHORT')),
    binance_margin_type TEXT CHECK (binance_margin_type IN ('isolated', 'cross')),
    
    -- Timing
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed'))
);

-- Strategy signals log (for debugging)
CREATE TABLE IF NOT EXISTS rt_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Signal details
    signal_type TEXT NOT NULL CHECK (signal_type IN ('entry', 'exit', 'adjustment')),
    side TEXT CHECK (side IN ('LONG', 'SHORT')),
    size DECIMAL(20,8),
    price DECIMAL(20,8),
    
    -- Decision context
    candle_data JSONB,
    strategy_state JSONB,
    rejection_reason TEXT,
    
    -- Execution
    executed BOOLEAN NOT NULL DEFAULT FALSE,
    execution_price DECIMAL(20,8),
    execution_notes TEXT,
    
    -- Binance specific
    binance_order_id BIGINT,
    binance_response JSONB,
    
    -- Timing
    signal_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Daily trading summary for risk management
CREATE TABLE IF NOT EXISTS rt_daily_summary (
    run_id UUID NOT NULL REFERENCES rt_runs(run_id) ON DELETE CASCADE,
    trading_date DATE NOT NULL,
    
    -- Daily statistics
    trades_count INTEGER NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    fees DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Risk metrics
    daily_return_pct DECIMAL(10,6) NOT NULL DEFAULT 0,
    max_drawdown_pct DECIMAL(5,4) NOT NULL DEFAULT 0,
    capital_start DECIMAL(20,8) NOT NULL DEFAULT 0,
    capital_end DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Trading activity
    max_concurrent_positions INTEGER NOT NULL DEFAULT 0,
    total_exposure DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (run_id, trading_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rt_runs_status ON rt_runs(status);
CREATE INDEX IF NOT EXISTS idx_rt_runs_created_at ON rt_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rt_runs_testnet ON rt_runs(testnet);
CREATE INDEX IF NOT EXISTS idx_rt_trades_run_symbol ON rt_trades(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_rt_trades_status ON rt_trades(status);
CREATE INDEX IF NOT EXISTS idx_rt_trades_entry_ts ON rt_trades(entry_ts DESC);
CREATE INDEX IF NOT EXISTS idx_rt_trades_binance_order_id ON rt_trades(binance_order_id);
CREATE INDEX IF NOT EXISTS idx_rt_equity_run_ts ON rt_equity(run_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_rt_positions_run_symbol ON rt_positions(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_rt_positions_status ON rt_positions(status);
CREATE INDEX IF NOT EXISTS idx_rt_signals_run_ts ON rt_signals(run_id, signal_ts DESC);
CREATE INDEX IF NOT EXISTS idx_rt_daily_summary_run_date ON rt_daily_summary(run_id, trading_date DESC);
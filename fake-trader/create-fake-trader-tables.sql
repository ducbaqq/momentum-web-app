-- Fake Trading Tables Schema
-- These tables track live/fake trading runs similar to backtests

-- Fake trading runs (similar to bt_runs)
CREATE TABLE IF NOT EXISTS ft_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    symbols TEXT[] NOT NULL,
    timeframe TEXT NOT NULL DEFAULT '15m',
    strategy_name TEXT NOT NULL,
    strategy_version TEXT NOT NULL DEFAULT '1.0',
    params JSONB NOT NULL DEFAULT '{}',
    seed INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'error')),
    
    -- Trading session info
    starting_capital DECIMAL(20,8) NOT NULL DEFAULT 10000,
    current_capital DECIMAL(20,8) NOT NULL DEFAULT 10000,
    max_concurrent_positions INTEGER DEFAULT 3,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stopped_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fake trading results per symbol (similar to bt_results)
CREATE TABLE IF NOT EXISTS ft_results (
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
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

-- Individual fake trades (similar to bt_trades)
CREATE TABLE IF NOT EXISTS ft_trades (
    trade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
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
    
    -- Meta
    reason TEXT,
    leverage DECIMAL(5,2) DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'error')),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Portfolio snapshots over time (similar to bt_equity)
CREATE TABLE IF NOT EXISTS ft_equity (
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS ft_positions (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
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
    
    -- Timing
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed'))
);

-- Strategy signals log (for debugging)
CREATE TABLE IF NOT EXISTS ft_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
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
    
    -- Timing
    signal_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ft_runs_status ON ft_runs(status);
CREATE INDEX IF NOT EXISTS idx_ft_runs_created_at ON ft_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ft_trades_run_symbol ON ft_trades(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ft_trades_status ON ft_trades(status);
CREATE INDEX IF NOT EXISTS idx_ft_trades_entry_ts ON ft_trades(entry_ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_equity_run_ts ON ft_equity(run_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_positions_run_symbol ON ft_positions(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ft_positions_status ON ft_positions(status);
CREATE INDEX IF NOT EXISTS idx_ft_signals_run_ts ON ft_signals(run_id, signal_ts DESC);
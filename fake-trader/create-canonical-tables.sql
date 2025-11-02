-- Canonical Data Model Schema for Fake Trader
-- This replaces the previous ft_trades approach with a more granular Order/Fill model

-- Account Snapshots: Portfolio state at specific points in time
CREATE TABLE IF NOT EXISTS ft_account_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Portfolio metrics
    equity DECIMAL(20,8) NOT NULL,
    cash DECIMAL(20,8) NOT NULL,
    margin_used DECIMAL(20,8) NOT NULL DEFAULT 0,
    exposure_gross DECIMAL(20,8) NOT NULL DEFAULT 0,
    exposure_net DECIMAL(20,8) NOT NULL DEFAULT 0,
    open_positions_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(run_id, ts)
);

-- Positions: High-level position tracking (aggregated from fills)
CREATE TABLE IF NOT EXISTS ft_positions_v2 (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Position details
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'OPEN', 'CLOSED')), -- FSM: NEW → OPEN → CLOSED
    
    -- Timing
    open_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    close_ts TIMESTAMP WITH TIME ZONE,
    
    -- Pricing (VWAP from fills)
    entry_price_vwap DECIMAL(20,8),
    exit_price_vwap DECIMAL(20,8),
    
    -- Quantities
    quantity_open DECIMAL(20,8) NOT NULL DEFAULT 0,
    quantity_close DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    -- Financials
    cost_basis DECIMAL(20,8) NOT NULL DEFAULT 0,
    fees_total DECIMAL(20,8) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(20,8) NOT NULL DEFAULT 0,
    leverage_effective DECIMAL(5,2) DEFAULT 1,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Position Rules: Enforce uniqueness constraints
-- Rule: No overlapping LONG/SHORT positions for same symbol in same run
-- This partial unique index enforces that you can't have both LONG and SHORT open at the same time
CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_positions_v2_unique_active_per_side 
  ON ft_positions_v2(run_id, symbol, side) 
  WHERE status IN ('NEW', 'OPEN');

-- Orders: Trading intent (entry/exit signals)
CREATE TABLE IF NOT EXISTS ft_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID REFERENCES ft_positions_v2(position_id) ON DELETE SET NULL,
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Order details
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    type TEXT NOT NULL CHECK (type IN ('ENTRY', 'EXIT', 'ADJUST')),
    qty DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8), -- Intended price (may differ from fill price)
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED')),
    
    -- Metadata
    reason_tag TEXT, -- e.g., 'momentum_breakout_v2_15m', 'stop_loss', 'take_profit'
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fills: Actual executions of orders
CREATE TABLE IF NOT EXISTS ft_fills (
    fill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES ft_orders(order_id) ON DELETE CASCADE,
    position_id UUID REFERENCES ft_positions_v2(position_id) ON DELETE SET NULL,
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    
    -- Fill details
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    qty DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    fee DECIMAL(20,8) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Price Snapshots: Price data points for analysis
CREATE TABLE IF NOT EXISTS ft_price_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    symbol TEXT NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(run_id, ts, symbol)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ft_account_snapshots_run_ts ON ft_account_snapshots(run_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_positions_v2_run_symbol ON ft_positions_v2(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ft_positions_v2_status ON ft_positions_v2(status);
CREATE INDEX IF NOT EXISTS idx_ft_orders_position ON ft_orders(position_id);
CREATE INDEX IF NOT EXISTS idx_ft_orders_run_symbol ON ft_orders(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ft_orders_status ON ft_orders(status);
CREATE INDEX IF NOT EXISTS idx_ft_orders_ts ON ft_orders(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_fills_order ON ft_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_ft_fills_position ON ft_fills(position_id);
CREATE INDEX IF NOT EXISTS idx_ft_fills_run_symbol ON ft_fills(run_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ft_fills_ts ON ft_fills(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_price_snapshots_run_ts_symbol ON ft_price_snapshots(run_id, ts DESC, symbol);


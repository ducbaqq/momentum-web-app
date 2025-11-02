-- Event Logging Contract Table
-- Structured events for trading system audit trail

CREATE TABLE IF NOT EXISTS ft_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    
    -- Event classification
    event_type TEXT NOT NULL CHECK (event_type IN (
        'ACCOUNT_SNAPSHOT',
        'ORDER_NEW',
        'ORDER_UPDATE',
        'FILL',
        'POSITION_OPENED',
        'POSITION_MARK',
        'POSITION_CLOSED',
        'STRATEGY_NOTE'
    )),
    
    -- Timestamp
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Event payload (JSONB for flexibility)
    payload JSONB NOT NULL DEFAULT '{}',
    
    -- Optional references
    order_id UUID REFERENCES ft_orders(order_id) ON DELETE SET NULL,
    fill_id UUID REFERENCES ft_fills(fill_id) ON DELETE SET NULL,
    position_id UUID REFERENCES ft_positions_v2(position_id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ft_events_run_ts ON ft_events(run_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ft_events_type ON ft_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ft_events_order ON ft_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft_events_fill ON ft_events(fill_id) WHERE fill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft_events_position ON ft_events(position_id) WHERE position_id IS NOT NULL;


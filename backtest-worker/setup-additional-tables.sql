-- Additional tables for professional backtesting

-- 1. Historical funding rates (8-hour intervals)
CREATE TABLE IF NOT EXISTS funding_8h (
    symbol TEXT NOT NULL,
    funding_time TIMESTAMPTZ NOT NULL,
    funding_rate DECIMAL(10,8) NOT NULL,  -- Funding rate (e.g., 0.0001 = 0.01%)
    mark_price DECIMAL(15,6),             -- Mark price at funding time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, funding_time)
);

-- 2. L1 order book snapshots (for realistic execution)
CREATE TABLE IF NOT EXISTS l1_snapshots (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    bid_price DECIMAL(15,6) NOT NULL,
    bid_size DECIMAL(15,6) NOT NULL,
    ask_price DECIMAL(15,6) NOT NULL,
    ask_size DECIMAL(15,6) NOT NULL,
    spread_bps DECIMAL(8,4),              -- Spread in basis points
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, ts)
);

-- 3. Mark prices (separate from last trade prices)
CREATE TABLE IF NOT EXISTS mark_prices (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    mark_price DECIMAL(15,6) NOT NULL,    -- Exchange mark price
    index_price DECIMAL(15,6),            -- Index price
    premium DECIMAL(8,6),                 -- Mark price premium over index
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, ts)
);

-- 4. Interest rates (for mark price calculation)
CREATE TABLE IF NOT EXISTS interest_rates (
    base_asset TEXT NOT NULL,             -- e.g., 'BTC'
    quote_asset TEXT NOT NULL,            -- e.g., 'USDT'
    ts TIMESTAMPTZ NOT NULL,
    base_rate DECIMAL(8,6) NOT NULL,      -- Base asset interest rate
    quote_rate DECIMAL(8,6) NOT NULL,     -- Quote asset interest rate
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (base_asset, quote_asset, ts)
);

-- 5. Exchange specifications (dynamic updates)
CREATE TABLE IF NOT EXISTS exchange_specs (
    symbol TEXT PRIMARY KEY,
    tick_size DECIMAL(15,8) NOT NULL,
    lot_size DECIMAL(15,8) NOT NULL,
    min_order_size DECIMAL(15,8) NOT NULL,
    max_order_size DECIMAL(15,8) NOT NULL,
    max_leverage INTEGER NOT NULL,
    maker_fee_bps DECIMAL(6,2) NOT NULL,  -- Maker fee in bps
    taker_fee_bps DECIMAL(6,2) NOT NULL,  -- Taker fee in bps
    risk_tiers JSONB NOT NULL,            -- Array of risk tiers
    funding_interval INTEGER DEFAULT 8,    -- Hours between funding
    max_funding_rate DECIMAL(6,4) DEFAULT 0.0075,
    price_deviation_limit DECIMAL(4,3) DEFAULT 0.1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Open interest data
CREATE TABLE IF NOT EXISTS open_interest (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    open_interest DECIMAL(15,6) NOT NULL, -- Total open interest
    open_interest_value DECIMAL(15,2),    -- Value in USDT
    count_long INTEGER,                    -- Number of long positions
    count_short INTEGER,                   -- Number of short positions
    PRIMARY KEY (symbol, ts)
);

-- 7. Liquidation data (for market impact modeling)
CREATE TABLE IF NOT EXISTS liquidations (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    price DECIMAL(15,6) NOT NULL,
    quantity DECIMAL(15,6) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    PRIMARY KEY (symbol, ts, side, price, quantity)
);

-- 8. Expanded features table (if needed)
-- This extends your existing features_1m with additional indicators
CREATE TABLE IF NOT EXISTS features_extended_1m (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    
    -- Momentum indicators
    roc_1m DECIMAL(8,4),
    roc_5m DECIMAL(8,4),
    roc_15m DECIMAL(8,4),
    roc_30m DECIMAL(8,4),
    roc_1h DECIMAL(8,4),
    roc_4h DECIMAL(8,4),
    
    -- Trend indicators  
    ema_10 DECIMAL(15,6),
    ema_20 DECIMAL(15,6),
    ema_50 DECIMAL(15,6),
    ema_100 DECIMAL(15,6),
    sma_200 DECIMAL(15,6),
    
    -- Volatility indicators
    atr_14 DECIMAL(15,6),
    bb_upper DECIMAL(15,6),
    bb_middle DECIMAL(15,6),
    bb_lower DECIMAL(15,6),
    bb_width DECIMAL(8,4),
    
    -- Oscillators
    rsi_14 DECIMAL(6,2),
    stoch_k DECIMAL(6,2),
    stoch_d DECIMAL(6,2),
    macd DECIMAL(15,6),
    macd_signal DECIMAL(15,6),
    macd_histogram DECIMAL(15,6),
    
    -- Volume indicators
    vol_sma_20 DECIMAL(15,6),
    vol_mult DECIMAL(8,4),
    vol_profile_poc DECIMAL(15,6),     -- Point of Control
    
    -- Market microstructure
    book_imb DECIMAL(8,4),             -- Order book imbalance
    spread_bps DECIMAL(8,4),           -- Bid-ask spread in bps  
    trade_intensity DECIMAL(10,4),     -- Trades per minute
    large_trade_ratio DECIMAL(6,4),    -- Ratio of large trades
    
    -- Sentiment indicators
    funding_rate DECIMAL(8,6),         -- Current funding rate
    oi_change_1h DECIMAL(8,4),         -- Open interest 1h change
    long_short_ratio DECIMAL(8,4),     -- Long/short ratio
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, ts)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_funding_8h_symbol_time ON funding_8h(symbol, funding_time DESC);
CREATE INDEX IF NOT EXISTS idx_l1_snapshots_symbol_ts ON l1_snapshots(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_mark_prices_symbol_ts ON mark_prices(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_open_interest_symbol_ts ON open_interest(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_liquidations_symbol_ts ON liquidations(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_features_extended_symbol_ts ON features_extended_1m(symbol, ts DESC);

-- Views for easier querying
CREATE OR REPLACE VIEW latest_funding_rates AS
SELECT DISTINCT ON (symbol) 
    symbol, 
    funding_time, 
    funding_rate,
    mark_price
FROM funding_8h 
ORDER BY symbol, funding_time DESC;

CREATE OR REPLACE VIEW latest_exchange_specs AS
SELECT * FROM exchange_specs;

-- Insert default Binance specifications
INSERT INTO exchange_specs (
    symbol, tick_size, lot_size, min_order_size, max_order_size, 
    max_leverage, maker_fee_bps, taker_fee_bps, risk_tiers
) VALUES 
('BTCUSDT', 0.1, 0.001, 0.001, 1000, 125, 2, 4, 
 '[
   {"maxNotional": 50000, "initialMarginRate": 0.004, "maintenanceMarginRate": 0.002},
   {"maxNotional": 250000, "initialMarginRate": 0.005, "maintenanceMarginRate": 0.0025},
   {"maxNotional": 1000000, "initialMarginRate": 0.01, "maintenanceMarginRate": 0.005},
   {"maxNotional": 5000000, "initialMarginRate": 0.025, "maintenanceMarginRate": 0.0125},
   {"maxNotional": 999999999, "initialMarginRate": 0.05, "maintenanceMarginRate": 0.025}
 ]'::jsonb),
('ETHUSDT', 0.01, 0.001, 0.001, 10000, 100, 2, 4,
 '[
   {"maxNotional": 25000, "initialMarginRate": 0.005, "maintenanceMarginRate": 0.0025},
   {"maxNotional": 100000, "initialMarginRate": 0.0075, "maintenanceMarginRate": 0.00375},
   {"maxNotional": 500000, "initialMarginRate": 0.01, "maintenanceMarginRate": 0.005},
   {"maxNotional": 1000000, "initialMarginRate": 0.025, "maintenanceMarginRate": 0.0125},
   {"maxNotional": 999999999, "initialMarginRate": 0.05, "maintenanceMarginRate": 0.025}
 ]'::jsonb)
ON CONFLICT (symbol) DO UPDATE SET
    tick_size = EXCLUDED.tick_size,
    lot_size = EXCLUDED.lot_size,
    min_order_size = EXCLUDED.min_order_size,
    max_order_size = EXCLUDED.max_order_size,
    max_leverage = EXCLUDED.max_leverage,
    maker_fee_bps = EXCLUDED.maker_fee_bps,
    taker_fee_bps = EXCLUDED.taker_fee_bps,
    risk_tiers = EXCLUDED.risk_tiers,
    updated_at = NOW();
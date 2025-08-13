-- Additional tables for momentum-collector to gather professional trading data
-- Run this in your momentum-collector database setup

-- 1. Historical funding rates (8-hour intervals)
CREATE TABLE IF NOT EXISTS funding_8h (
    symbol TEXT NOT NULL,
    funding_time TIMESTAMPTZ NOT NULL,
    funding_rate DECIMAL(10,8) NOT NULL,  -- Funding rate (e.g., 0.0001 = 0.01%)
    mark_price DECIMAL(15,6),             -- Mark price at funding time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, funding_time)
);

-- 2. Mark prices (separate from last trade prices) 
CREATE TABLE IF NOT EXISTS mark_prices (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    mark_price DECIMAL(15,6) NOT NULL,    -- Exchange mark price
    index_price DECIMAL(15,6),            -- Index price
    premium DECIMAL(8,6),                 -- Mark price premium over index
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, ts)
);

-- 3. Exchange specifications (dynamic updates)
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

-- 4. Open interest data
CREATE TABLE IF NOT EXISTS open_interest (
    symbol TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    open_interest DECIMAL(15,6) NOT NULL, -- Total open interest
    open_interest_value DECIMAL(15,2),    -- Value in USDT
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, ts)
);

-- 5. Enhance existing l1_snapshots with spread calculation
-- Add spread_bps column if not exists
ALTER TABLE l1_snapshots 
ADD COLUMN IF NOT EXISTS spread_bps DECIMAL(8,4);

-- Create function to calculate spread in basis points
CREATE OR REPLACE FUNCTION calculate_spread_bps(bid_price DECIMAL, ask_price DECIMAL) 
RETURNS DECIMAL AS $$
BEGIN
    IF bid_price <= 0 OR ask_price <= 0 OR ask_price <= bid_price THEN
        RETURN NULL;
    END IF;
    RETURN ((ask_price - bid_price) / ((bid_price + ask_price) / 2)) * 10000;
END;
$$ LANGUAGE plpgsql;

-- Update existing records with spread calculation
UPDATE l1_snapshots 
SET spread_bps = calculate_spread_bps(bid_price, ask_price)
WHERE spread_bps IS NULL AND bid_price > 0 AND ask_price > bid_price;

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_funding_8h_symbol_time ON funding_8h(symbol, funding_time DESC);
CREATE INDEX IF NOT EXISTS idx_mark_prices_symbol_ts ON mark_prices(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_specs_updated ON exchange_specs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_open_interest_symbol_ts ON open_interest(symbol, ts DESC);

-- Views for easier querying
CREATE OR REPLACE VIEW latest_funding_rates AS
SELECT DISTINCT ON (symbol) 
    symbol, 
    funding_time, 
    funding_rate,
    mark_price
FROM funding_8h 
ORDER BY symbol, funding_time DESC;

CREATE OR REPLACE VIEW latest_mark_prices AS
SELECT DISTINCT ON (symbol)
    symbol,
    ts,
    mark_price,
    index_price,
    premium
FROM mark_prices
ORDER BY symbol, ts DESC;

-- Insert default Binance specifications (examples)
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

-- Comments for momentum-collector developers
COMMENT ON TABLE funding_8h IS 'Collect from /fapi/v1/fundingRate every 8 hours at 00:00, 08:00, 16:00 UTC';
COMMENT ON TABLE mark_prices IS 'Collect from /fapi/v1/premiumIndex every minute';
COMMENT ON TABLE exchange_specs IS 'Collect from /fapi/v1/exchangeInfo daily or when specs change';
COMMENT ON TABLE open_interest IS 'Collect from /fapi/v1/openInterest every hour';

-- Trigger to auto-calculate spread_bps on l1_snapshots insert/update
CREATE OR REPLACE FUNCTION update_spread_bps() RETURNS TRIGGER AS $$
BEGIN
    NEW.spread_bps := calculate_spread_bps(NEW.bid_price, NEW.ask_price);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_spread_bps ON l1_snapshots;
CREATE TRIGGER trigger_update_spread_bps
    BEFORE INSERT OR UPDATE ON l1_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_spread_bps();
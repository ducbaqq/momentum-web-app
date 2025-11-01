-- Fix Database CPU Performance Issues
-- This script adds missing indexes to optimize frequently run queries

-- 1. Critical indexes for /api/ticks/latest query
-- This query does: SELECT symbol, MAX(ts) FROM ohlcv_1m GROUP BY symbol
-- Need composite index on (symbol, ts) to optimize GROUP BY + MAX operation
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_desc ON ohlcv_1m(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_asc ON ohlcv_1m(symbol, ts ASC);

-- 2. Critical index for features_1m JOIN
-- The JOIN uses: features_1m ON f.symbol = o.symbol AND f.ts = o.ts
-- Need composite index on (symbol, ts) for efficient JOIN
CREATE INDEX IF NOT EXISTS idx_features_1m_symbol_ts ON features_1m(symbol, ts);

-- 3. Index for /api/symbols query (DISTINCT symbol)
-- Already has ts index, but symbol index helps DISTINCT queries
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol ON ohlcv_1m(symbol);

-- 4. Index for timestamp filtering (if needed in future)
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_ts_symbol ON ohlcv_1m(ts DESC, symbol);

-- 5. Analyze tables to update query planner statistics
ANALYZE ohlcv_1m;
ANALYZE features_1m;


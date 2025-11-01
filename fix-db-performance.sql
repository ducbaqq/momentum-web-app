-- Fix Database CPU Performance Issues
-- This script adds missing indexes and optimizes query performance

-- 1. Add composite indexes for common query patterns
-- These indexes will dramatically speed up queries filtering by symbol and ordering by timestamp

-- For ohlcv_1m table - most queries filter by symbol and order by ts DESC
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_desc ON ohlcv_1m(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_asc ON ohlcv_1m(symbol, ts ASC);

-- For features_1m table - most queries join on symbol and ts
CREATE INDEX IF NOT EXISTS idx_features_1m_symbol_ts_desc ON features_1m(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_features_1m_symbol_ts_asc ON features_1m(symbol, ts ASC);

-- Composite index for timestamp filtering (for queries that filter by ts range without symbol)
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_ts_symbol ON ohlcv_1m(ts DESC, symbol);

-- 2. Analyze tables to update statistics for query planner
ANALYZE ohlcv_1m;
ANALYZE features_1m;


-- Migration: Create table to track last processed candle per symbol per run
-- This fixes the bug where last_processed_candle was tracked per-run instead of per-symbol
-- which caused issues when processing multiple symbols

CREATE TABLE IF NOT EXISTS ft_last_processed_candles (
    run_id UUID NOT NULL REFERENCES ft_runs(run_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    last_processed_candle TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (run_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_ft_last_processed_candles_run_symbol ON ft_last_processed_candles(run_id, symbol);

-- Migrate existing data from ft_runs.last_processed_candle if it exists
-- This will create one entry per run (not per symbol, but better than nothing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'ft_runs' AND column_name = 'last_processed_candle') THEN
        INSERT INTO ft_last_processed_candles (run_id, symbol, last_processed_candle)
        SELECT run_id, unnest(symbols) as symbol, last_processed_candle
        FROM ft_runs
        WHERE last_processed_candle IS NOT NULL
        ON CONFLICT (run_id, symbol) DO NOTHING;
    END IF;
END $$;

COMMENT ON TABLE ft_last_processed_candles IS 'Tracks the last processed candle timestamp per symbol per run. This ensures each symbol is tracked independently.';


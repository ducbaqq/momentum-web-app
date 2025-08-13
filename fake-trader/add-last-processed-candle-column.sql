-- Add last_processed_candle column to ft_runs table for tracking 15m candle processing
ALTER TABLE ft_runs ADD COLUMN last_processed_candle TIMESTAMP;

-- Add comment explaining the column
COMMENT ON COLUMN ft_runs.last_processed_candle IS 'Timestamp of the last 15m candle processed for entry signal evaluation';
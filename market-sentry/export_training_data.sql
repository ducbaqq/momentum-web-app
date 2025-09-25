-- Export Training Data for Hyperparameter Optimization
-- ====================================================
--
-- This query exports 1-minute OHLCV data for hyperparameter optimization.
-- Date range: August 11, 2025 to September 24, 2025 (first 80% for training)
--
-- Usage: Run this in psql and save output as CSV:
-- psql your_database -f export_training_data.sql -o historical_data.csv -F ',' -A

-- Set dates (adjust these as needed)
-- Full period: August 11, 2025 to September 24, 2025 (~45 days)
-- Training: First 80% (~36 days) → August 11 to September 16, 2025
-- Validation: Last 20% (~9 days) → September 16 to September 24, 2025

-- These variables will be set by the calling script
-- \set training_start '2025-08-11 00:00:00+00'
-- \set training_end '2025-09-16 00:00:00+00'
-- \set symbol_filter 'SOLUSDT'

-- Debug: Show what we're querying and data availability
SELECT 'Querying symbol: ' || :'symbol_filter' || ', dates: ' || :'training_start' || ' to ' || :'training_end' as debug_info;

-- Check data availability
SELECT
    COUNT(*) as total_ohlcv_rows,
    COUNT(DISTINCT ts::date) as total_days,
    MIN(ts) as earliest_timestamp,
    MAX(ts) as latest_timestamp
FROM ohlcv_1m
WHERE symbol = :'symbol_filter'
  AND ts >= :'training_start'::timestamp
  AND ts < :'training_end'::timestamp;

-- Export training data (first 80% of timeframe)
COPY (
    SELECT
        -- Convert timestamp to format expected by pandas
        to_char(o.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,

        -- OHLCV data (required for backtesting)
        o.open::double precision as open,
        o.high::double precision as high,
        o.low::double precision as low,
        o.close::double precision as close,
        COALESCE(o.volume, 0)::double precision as volume,

        -- Optional: Include pre-calculated technical indicators
        -- (Note: The optimizer calculates these safely to avoid lookahead bias)
        f.roc_1m,
        f.roc_5m,
        f.roc_15m,
        f.roc_30m,
        f.roc_1h,
        f.roc_4h,
        f.vol_mult,
        f.rsi_14,
        f.spread_bps,
        f.book_imb

    FROM ohlcv_1m o
    LEFT JOIN features_1m f ON o.ts = f.ts AND o.symbol = f.symbol

    WHERE o.symbol = :'symbol_filter'
      AND o.ts >= :'training_start'::timestamp
      AND o.ts < :'training_end'::timestamp

    ORDER BY o.ts ASC

) TO STDOUT WITH CSV HEADER;

-- Alternative: Export validation data separately (last 20%)
-- Uncomment and run separately if you want validation data:
--
-- \set validation_start '2024-09-16 00:00:00+00'
-- \set validation_end '2024-09-24 00:00:00+00'
--
-- COPY (
--     SELECT
--         to_char(o.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') as timestamp,
--         o.open::double precision as open,
--         o.high::double precision as high,
--         o.low::double precision as low,
--         o.close::double precision as close,
--         COALESCE(o.volume, 0)::double precision as volume,
--         f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
--         f.vol_mult, f.rsi_14, f.spread_bps, f.book_imb
--     FROM ohlcv_1m o
--     LEFT JOIN features_1m f ON o.ts = f.ts AND o.symbol = f.symbol
--     WHERE o.symbol = :'symbol_filter'
--       AND o.ts >= :'validation_start'::timestamp
--       AND o.ts <= :'validation_end'::timestamp
--     ORDER BY o.ts ASC
-- ) TO STDOUT WITH CSV HEADER;

-- Check Available Data in Database
-- ================================

-- Available symbols and their data ranges
SELECT
    symbol,
    COUNT(*) as total_candles,
    COUNT(DISTINCT ts::date) as total_days,
    MIN(ts) as earliest_date,
    MAX(ts) as latest_date,
    ROUND(AVG(volume)::numeric, 2) as avg_volume
FROM ohlcv_1m
GROUP BY symbol
ORDER BY total_candles DESC;

-- Check SOLUSDT data specifically
SELECT
    'SOLUSDT Data Summary' as info,
    COUNT(*) as total_candles,
    COUNT(DISTINCT ts::date) as total_days,
    MIN(ts) as earliest_date,
    MAX(ts) as latest_date
FROM ohlcv_1m
WHERE symbol = 'SOLUSDT';

-- Check data for training period (Aug 11 - Sep 16, 2024)
SELECT
    'SOLUSDT Training Period (Aug 11 - Sep 16)' as period,
    COUNT(*) as candles_in_period,
    COUNT(DISTINCT ts::date) as days_in_period,
    MIN(ts) as earliest_in_period,
    MAX(ts) as latest_in_period
FROM ohlcv_1m
WHERE symbol = 'SOLUSDT'
  AND ts >= '2024-08-11 00:00:00+00'::timestamp
  AND ts < '2024-09-16 00:00:00+00'::timestamp;

-- Check features_1m table for SOLUSDT
SELECT
    'SOLUSDT Features Data' as info,
    COUNT(*) as total_features_rows,
    MIN(ts) as earliest_features,
    MAX(ts) as latest_features
FROM features_1m
WHERE symbol = 'SOLUSDT';

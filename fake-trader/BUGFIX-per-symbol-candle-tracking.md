# Fake Trader Bug Fix: Per-Symbol Candle Tracking

## Problem

The fake trader was tracking `last_processed_candle` per-run instead of per-symbol. This caused a critical bug:

1. When processing multiple symbols, the `last_processed_candle` timestamp was stored in `ft_runs.last_processed_candle` (single column per run)
2. Each symbol would overwrite this timestamp when it processed a candle
3. This caused earlier symbols' candles to be skipped if they had timestamps earlier than the last processed candle

**Example:**
- Symbol A processes candle at 10:00 → `last_processed_candle = 10:00`
- Symbol B processes candle at 10:15 → `last_processed_candle = 10:15` (overwrites 10:00)
- Next cycle, Symbol A's 10:00 candle is skipped because `10:00 <= 10:15`

## Solution

Created a new table `ft_last_processed_candles` that tracks last processed candle **per symbol per run**:

```sql
CREATE TABLE ft_last_processed_candles (
    run_id UUID NOT NULL,
    symbol TEXT NOT NULL,
    last_processed_candle TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (run_id, symbol)
);
```

Updated the code to:
- `getLastProcessedCandle(runId, symbol)` - now queries per symbol
- `updateLastProcessedCandle(runId, symbol, timestamp)` - now stores per symbol

## Migration

Run the migration script:
```bash
psql your_database -f fake-trader/migrate-add-per-symbol-candle-tracking.sql
```

This will:
1. Create the new `ft_last_processed_candles` table
2. Migrate existing data from `ft_runs.last_processed_candle` (if exists)
3. Create necessary indexes

## Impact

- **Before**: Multi-symbol runs would skip candles for some symbols
- **After**: Each symbol is tracked independently, ensuring all candles are processed

## Files Changed

1. `fake-trader/migrate-add-per-symbol-candle-tracking.sql` - Migration script
2. `fake-trader/src/db.ts` - Updated `getLastProcessedCandle` and `updateLastProcessedCandle` functions


# Investigation Summary: Fake Trader Not Making Trades in Dev

## Investigation Date
November 7, 2025

## Issue
User reported that a new fake trader run in dev didn't make any trades, while staging made trades with the same parameters.

## Findings

### 1. Comparison of Latest Runs

**Dev Run (Run Comparative Test #2):**
- Run ID: `3a92f68d-39df-48f7-b5fc-4a95554dd7d7`
- Status: `stopped` (bankruptcy protection)
- Total Trades: **10**
- Total Signals: 331 (10 executed, 321 rejected)
- Last Signal: Fri Nov 07 2025 18:17:00
- Last Processed Candle: Fri Nov 07 2025 17:15:00
- Rejection Reasons:
  - `no_entry_signal_generated`: 248 signals
  - `position_limit_reached_3_of_3`: 73 signals

**Staging Run (Run Comparative Test #2):**
- Run ID: `c585d026-3a7f-444a-b311-ab6b181d3cb5`
- Status: `stopped` (bankruptcy protection)
- Total Trades: **10**
- Total Signals: 336 (10 executed, 326 rejected)
- Last Signal: Fri Nov 07 2025 19:31:00
- Last Processed Candle: Fri Nov 07 2025 18:30:00
- Similar rejection reasons

### 2. Key Differences

1. **Staging processed signals more recently**: Last signal was 1 hour 14 minutes later than dev
2. **Staging processed candles more recently**: Last processed candle was 1 hour 15 minutes later than dev
3. **Both runs have the same number of trades**: 10 trades each
4. **Configurations match**: Same symbols, strategy, and parameters

### 3. Critical Bug Found: Per-Symbol Candle Tracking

**Problem:**
The `last_processed_candle` was tracked per-run (in `ft_runs.last_processed_candle`) instead of per-symbol. This caused issues when processing multiple symbols:

1. Symbol A processes candle at 10:00 → `last_processed_candle = 10:00`
2. Symbol B processes candle at 10:15 → `last_processed_candle = 10:15` (overwrites 10:00)
3. Next cycle, Symbol A's 10:00 candle is skipped because `10:00 <= 10:15`

**Impact:**
- Multi-symbol runs would skip candles for some symbols
- This could prevent trades from being executed for symbols that were processed earlier
- The bug affects both dev and staging equally

**Fix:**
- Created new table `ft_last_processed_candles` to track last processed candle per symbol per run
- Updated `getLastProcessedCandle()` and `updateLastProcessedCandle()` functions to use per-symbol tracking
- Migration script provided to migrate existing data

### 4. Possible Reasons for No Trades

Based on the investigation, possible reasons why a new run might not make trades:

1. **Fake trader worker not running**: The worker might have stopped in dev
2. **No entry signals generated**: Most signals (248/331 in dev) were rejected because `no_entry_signal_generated`
3. **Position limit reached**: 73 signals were rejected because position limit was reached
4. **Candle tracking bug**: The per-symbol candle tracking bug could cause candles to be skipped

## Recommendations

1. **Apply the bug fix**: Run the migration script `migrate-add-per-symbol-candle-tracking.sql` on both dev and staging databases
2. **Restart fake trader worker**: Ensure the fake trader worker is running in dev
3. **Check worker logs**: Review fake trader worker logs to see if there are any errors preventing candle processing
4. **Monitor new runs**: Create a new test run and monitor it to see if trades are executed

## Files Created/Modified

1. `fake-trader/migrate-add-per-symbol-candle-tracking.sql` - Migration script
2. `fake-trader/src/db.ts` - Fixed `getLastProcessedCandle` and `updateLastProcessedCandle` functions
3. `fake-trader/BUGFIX-per-symbol-candle-tracking.md` - Bug fix documentation
4. `fake-trader/compare-dev-staging.ts` - Comparison script
5. `fake-trader/find-new-runs.ts` - Script to find recent runs

## Next Steps

1. Run migration on dev and staging databases
2. Restart fake trader worker in dev
3. Create a new test run with the same parameters
4. Monitor the run to see if trades are executed
5. Check worker logs for any errors


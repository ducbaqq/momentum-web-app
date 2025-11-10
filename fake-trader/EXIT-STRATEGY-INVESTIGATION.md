# Fake Trader Exit Strategy Investigation

## Summary

The fake trader has **two types of exit mechanisms**, but only **one is currently active**:

### 1. **Automatic Exit Conditions** (ACTIVE) ✅

Checked every minute during position updates in `checkExitConditions()`:

**Location:** `fake-trader/src/index.ts:328-371`

**Exit Triggers:**
1. **Time-based exit**: Positions older than 24 hours are automatically closed
   - Reason: `time_based_exit`
   - Checked: Every minute when updating positions

2. **Stop Loss**: If position has `stop_loss` set and price hits it
   - LONG: Closes when `currentPrice <= stop_loss`
   - SHORT: Closes when `currentPrice >= stop_loss`
   - Reason: `stop_loss_trigger`
   - Checked: Every minute when updating positions

3. **Take Profit**: If position has `take_profit` set and price hits it
   - LONG: Closes when `currentPrice >= take_profit`
   - SHORT: Closes when `currentPrice <= take_profit`
   - Reason: `take_profit_trigger`
   - Checked: Every minute when updating positions

**Default Values (from strategy):**
- Stop Loss: `candle.close * 0.98` (2% below entry)
- Take Profit: `candle.close * 1.03` (3% above entry)

**Execution:**
- Uses live prices from `getLivePrices()` (1-minute candles)
- Checked in `updateExistingPositions()` → `checkExitConditions()`
- Runs every 1 minute

### 2. **Strategy-Based Exit Signals** (NOT ACTIVE) ❌

The strategy (`momentumBreakoutV2Strategy`) can generate exit signals, but they are **NOT being processed**.

**Location:** `fake-trader/src/strategies.ts:72-86`

**Strategy Exit Conditions:**
1. **Momentum Loss**: `roc_1m < 0` (negative 1-minute rate of change)
   - Reason: `momentum_loss`
   - Generates opposite side signal (SHORT for LONG position, LONG for SHORT position)

2. **RSI Overbought**: `rsi_14 > 75`
   - Reason: `rsi_overbought`
   - Generates opposite side signal

**Why Not Active:**
- Line 420 in `processSymbolEntrySignals()`: `// Only process entry signals here (exit signals handled in position management)`
- Only signals with `side === 'LONG' || side === 'SHORT'` are processed as entry signals
- Strategy exit signals generate opposite-side signals (SHORT for LONG position), but these are treated as entry signals, not exits
- There's an `executeSignal()` function that handles exit signals (lines 588-725), but it's **never called**

## Current Exit Flow

```
Every 1 Minute:
├── Update positions with live prices
├── Check exit conditions for each position:
│   ├── Time > 24 hours? → Close
│   ├── Hit stop loss? → Close
│   └── Hit take profit? → Close
└── Strategy exit signals: IGNORED ❌
```

## Issues Found

1. **Strategy exit signals are not processed**: The strategy generates exit signals based on momentum loss and RSI, but they're never executed
2. **Only automatic exits work**: Positions only close via stop loss, take profit, or time-based exit
3. **No strategy-based momentum/RSI exits**: Even though the strategy calculates these conditions, they don't trigger position closures

## Recommendations

1. **Process strategy exit signals**: Modify `processSymbolEntrySignals()` to handle exit signals from the strategy
2. **Or remove strategy exit logic**: If automatic exits are preferred, remove the exit signal generation from the strategy
3. **Document the actual behavior**: Update documentation to reflect that only automatic exits are active

## Code References

- Exit condition checks: `fake-trader/src/index.ts:328-371`
- Strategy exit signals: `fake-trader/src/strategies.ts:72-86`
- Position updates: `fake-trader/src/index.ts:260-303`
- Entry signal processing: `fake-trader/src/index.ts:373-439`


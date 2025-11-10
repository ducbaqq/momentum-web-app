# Bug Fix: Strategy Exit Signals Treated as Entry Signals

## Problem

The fake trader was experiencing large losses because **strategy exit signals were being treated as entry signals**, causing positions to be opened without stop loss/take profit protection.

## Root Cause

1. **Strategy Exit Signal Format**: When the strategy detects an exit condition (momentum loss or RSI overbought), it generates an exit signal with the **opposite side** of the existing position:
   - LONG position → generates SHORT signal to exit
   - SHORT position → generates LONG signal to exit

2. **Exit Signals Don't Have Stop Loss/Take Profit**: Exit signals from the strategy don't include `stopLoss` or `takeProfit` values (they're meant to close positions, not open new ones).

3. **Code Bug**: The code at line 421 treated **ALL** signals with `side === 'LONG' || side === 'SHORT'` as entry signals:
   ```typescript
   // Only process entry signals here (exit signals handled in position management)
   if (signal.side === 'LONG' || signal.side === 'SHORT') {
     await this.executeEntrySignal(run, signal, candle);
   }
   ```

4. **Result**: Exit signals were executed as new position entries without stop loss/take profit, leading to large losses.

## Example from Staging Run

**Run:** `c585d026-3a7f-444a-b311-ab6b181d3cb5`

1. LONG position opened at $2.50 with stop loss $2.45, take profit $2.57 ✅
2. Strategy detects momentum loss → generates SHORT exit signal
3. Code treats SHORT as new entry → opens SHORT at $2.53 **WITHOUT stop loss/take profit** ❌
4. SHORT position runs for 24 hours (time-based exit)
5. Closes at $2.67 → **Loss of -$392.35** ❌

**Expected behavior:** SHORT signal should have closed the LONG position at $2.50, not opened a new SHORT position.

## Fix

Modified `processSymbolEntrySignals()` to:

1. **Detect exit signals**: Check if signal is opposite side of existing position
2. **Close existing position**: If it's an exit signal, close the existing position instead of opening a new one
3. **Only open new positions**: For actual entry signals (no existing position or same side)

**Code changes:**
- Added detection: `isExitSignal = existingPosition && opposite side`
- If exit signal: Close existing position using `closePosition()`
- If entry signal: Open new position using `executeEntrySignal()`

## Impact

- **Before**: Exit signals opened new positions without stop loss → large losses
- **After**: Exit signals properly close existing positions → positions exit when strategy detects exit conditions

## Verification

After fix:
- Strategy exit signals will close positions immediately
- Positions will have stop loss/take profit protection (from entry signals)
- Large losses from unstopped positions should be prevented

## Files Changed

- `fake-trader/src/index.ts` - Fixed signal processing to distinguish entry vs exit signals


import dotenv from 'dotenv';
import cron from 'node-cron';
import {
  testConnection,
  getActiveRuns,
  getCurrentCandles,
  getRecentCandles,
  getLivePrices,
  getLastProcessedCandle,
  updateLastProcessedCandle,
  logSignal,
  updateRunStatus,
  updateRunCapital,
  pool
} from './db.js';
import {
  createOrder,
  createFill,
  createPositionV2,
  getOpenPositionsV2,
  getOpenPositionV2BySymbol,
  getOpenPositionsV2BySymbol,
  hasOverlappingPosition,
  updatePositionFromFills,
  closePositionV2,
  createAccountSnapshot,
  createPriceSnapshot,
  linkOrderToPosition,
  updateOrderStatus,
  updateOrderStatusFromFills,
  getOrder,
  getFill,
  getPositionV2,
} from './canonical-db.js';
import {
  logAccountSnapshot,
  logOrderNew,
  logOrderUpdate,
  logFill,
  logPositionOpened,
  logPositionMark,
  logPositionClosed,
  logStrategyNote,
} from './events.js';
import { getStrategy } from './strategies.js';
import type { FakeTradeRun, Candle, PositionV2 } from './types.js';

// Load environment variables
dotenv.config();

class FakeTrader {
  private running = false;

  async start() {
    console.log('🚀 Starting Fake Trader...');
    
    // Test database connection
    await testConnection();
    
    // Check for downtime recovery
    await this.handleDowntimeRecovery();
    
    // Schedule trading execution every 1 minute
    // Core evaluation: every 1 minute
    cron.schedule('* * * * *', async () => {
      if (this.running) {
        console.log('⏰ Previous execution still running, skipping...');
        return;
      }
      
      this.running = true;
      try {
        await this.executeTradingCycle();
      } catch (error) {
        console.error('❌ Trading cycle error:', error);
      } finally {
        this.running = false;
      }
    });
    
    console.log('⏰ Fake Trader scheduled to run every 1 minute');
    console.log('📊 Watching for active trading runs...');
    
    // Run initial cycle
    await this.executeTradingCycle();
  }

  private async handleDowntimeRecovery() {
    console.log('🔍 Checking for downtime recovery...');
    
    try {
      // Get active runs and check their last update times
      const activeRuns = await getActiveRuns();
      const now = new Date();
      
      for (const run of activeRuns) {
        const lastUpdate = new Date(run.last_update || now.toISOString());
        const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
        
        // If last update was more than 5 minutes ago, we missed at least some cycles
        if (minutesSinceUpdate > 5) {
          console.log(`⚠️  Run ${run.run_id} missed ${Math.floor(minutesSinceUpdate)} cycles during downtime`);
          
          // Update stale positions with current market prices
          await this.refreshStalePositions(run);
          
          // Log the recovery event
          await logSignal({
            run_id: run.run_id,
            symbol: 'SYSTEM',
            signal_type: 'adjustment',
            rejection_reason: `System recovery after ${minutesSinceUpdate.toFixed(1)} minutes downtime`,
            executed: false,
            signal_ts: now.toISOString()
          });
        }
      }
      
      console.log(`✅ Downtime recovery completed for ${activeRuns.length} active runs`);
    } catch (error) {
      console.error('❌ Downtime recovery failed:', error);
    }
  }

  private async refreshStalePositions(run: FakeTradeRun) {
    try {
      console.log(`🔄 Refreshing stale positions for run ${run.run_id}`);
      
      // Get current positions V2 for this run
      const positionsV2 = await getOpenPositionsV2(run.run_id);
      
      if (positionsV2.length === 0) {
        return;
      }
      
      // Get current market data for position symbols
      const symbols = [...new Set(positionsV2.map(p => p.symbol))];
      const candles = await getCurrentCandles(symbols);
      
      // Update each position with current market price
      for (const position of positionsV2) {
        const candle = candles[position.symbol];
        if (!candle) {
          console.log(`⚠️  No current data for ${position.symbol}, keeping stale price`);
          continue;
        }
        
        // Record PriceSnapshot
        await createPriceSnapshot({
          run_id: run.run_id,
          ts: new Date().toISOString(),
          symbol: position.symbol,
          price: candle.close,
        });
        
        if (position.entry_price_vwap) {
          const unrealizedPnl = this.calculateUnrealizedPnLV2(position, candle.close);
          console.log(`   📊 Updated ${position.symbol}: $${position.entry_price_vwap.toFixed(2)} → $${candle.close.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
        }
      }
      
      console.log(`✅ Updated ${positionsV2.length} stale positions for run ${run.run_id}`);
      
    } catch (error) {
      console.error(`❌ Failed to refresh positions for run ${run.run_id}:`, error);
    }
  }

  private async executeTradingCycle() {
    console.log(`\n🔄 [${new Date().toISOString()}] Executing trading cycle...`);
    
    // Get all active trading runs
    const activeRuns = await getActiveRuns();
    
    if (activeRuns.length === 0) {
      console.log('📭 No active trading runs found');
      return;
    }
    
    console.log(`📈 Processing ${activeRuns.length} active trading runs`);
    
    for (const run of activeRuns) {
      try {
        await this.processRun(run);
      } catch (error: any) {
        console.error(`❌ Error processing run ${run.run_id}:`, error.message);
        await updateRunStatus(run.run_id, 'error', error.message);
      }
    }
    
    console.log('✅ Trading cycle completed');
    
    // Create AccountSnapshot for all active runs
    for (const run of activeRuns) {
      await this.createAccountSnapshot(run);
    }
  }

  private async createAccountSnapshot(run: FakeTradeRun) {
    try {
      // Get open positions V2
      const positionsV2 = await getOpenPositionsV2(run.run_id);
      
      // Calculate metrics from positions
      const marginUsed = positionsV2.reduce((sum, pos) => sum + pos.cost_basis, 0);
      
      // Calculate exposure (gross and net)
      // Gross exposure = sum of all position values (absolute)
      // Net exposure = sum of position values (LONG positive, SHORT negative)
      let exposureGross = 0;
      let exposureNet = 0;
      
      for (const pos of positionsV2) {
        const positionValue = pos.quantity_open * (pos.entry_price_vwap || 0);
        exposureGross += Math.abs(positionValue);
        if (pos.side === 'LONG') {
          exposureNet += positionValue;
        } else {
          exposureNet -= positionValue;
        }
      }
      
      // PnL and Fees Rule: Unrealized PnL recomputed from mark price (never stored)
      // Get current mark prices (live market prices)
      const livePrices = await getLivePrices(run.symbols);
      let unrealizedPnl = 0;
      
      for (const pos of positionsV2) {
        const markPrice = livePrices[pos.symbol];
        if (markPrice && pos.entry_price_vwap) {
          // Compute unrealized PnL from mark price (current market price)
          const pnl = this.calculateUnrealizedPnLV2(pos, markPrice);
          unrealizedPnl += pnl;
        }
      }
      
      // Cash = capital - margin used
      // Note: capital only includes realized PnL (no unrealized)
      const cash = run.current_capital - marginUsed;
      
      // Equity = cash + margin used + unrealized PnL
      // This is for display/reporting only - equity changes only when positions close
      // (realized PnL is included in capital, unrealized is added here for display)
      const equity = cash + marginUsed + unrealizedPnl;
      
      await createAccountSnapshot({
        run_id: run.run_id,
        ts: new Date().toISOString(),
        equity,
        cash,
        margin_used: marginUsed,
        exposure_gross: exposureGross,
        exposure_net: Math.abs(exposureNet),
        open_positions_count: positionsV2.length,
      });
      
      // Logging Contract: ACCOUNT_SNAPSHOT event
      await logAccountSnapshot(run.run_id, {
        snapshot_id: '',
        run_id: run.run_id,
        ts: new Date().toISOString(),
        equity,
        cash,
        margin_used: marginUsed,
        exposure_gross: exposureGross,
        exposure_net: Math.abs(exposureNet),
        open_positions_count: positionsV2.length,
        created_at: new Date().toISOString(),
      }, livePrices);
    } catch (error: any) {
      console.error(`Failed to create account snapshot for run ${run.run_id}:`, error.message);
    }
  }

  private async processRun(run: FakeTradeRun) {
    console.log(`\n🎯 Processing run: ${run.name || run.run_id}`);
    console.log(`   Strategy: ${run.strategy_name}`);
    console.log(`   Symbols: ${run.symbols.join(', ')}`);
    console.log(`   Capital: $${run.current_capital}`);
    
    // Bankruptcy protection - stop runs with negative capital
    if (run.current_capital < 0) {
      console.log(`   💸 BANKRUPTCY: Capital is negative ($${run.current_capital.toFixed(2)}) - stopping run`);
      await updateRunStatus(run.run_id, 'stopped', `Bankruptcy protection: Capital went negative ($${run.current_capital.toFixed(2)})`);
      return;
    }
    
    // Safety check - if run has way too many positions, stop it immediately
    const currentPositionsV2 = await getOpenPositionsV2(run.run_id);
    if (currentPositionsV2.length > run.max_concurrent_positions * 2) {
      console.log(`   🚨 SAFETY: Too many positions (${currentPositionsV2.length} vs limit ${run.max_concurrent_positions}) - stopping run and closing positions`);
      
      // Stop the run
      await updateRunStatus(run.run_id, 'stopped', `Safety stop: Too many open positions (${currentPositionsV2.length} vs limit ${run.max_concurrent_positions})`);
      
      // Force close all positions  
      await pool.query(`UPDATE ft_positions_v2 SET status = 'CLOSED' WHERE run_id = $1 AND status IN ('NEW', 'OPEN')`, [run.run_id]);
      console.log(`   🔄 Force closed ${currentPositionsV2.length} positions`);
      
      return;
    }
    
    // Get live prices for position management (always needed)
    const livePrices = await getLivePrices(run.symbols);
    
    // Update existing positions with current prices
    await this.updateExistingPositions(run, livePrices);
    
    // Get recent candles at the configured timeframe
    console.log(`   📊 Evaluating entry signals using recent ${run.timeframe} candles`);

    // Get recent candles for all symbols (look back enough to have historical context)
    const lookbackMinutes = 300; // Look back 5 hours for enough historical context
    const recentCandles = await getRecentCandles(run.symbols, lookbackMinutes, run.timeframe);

    // Get momentum_breakout_v2 strategy function
    const strategy = getStrategy('momentum_breakout_v2');

    // Process each symbol's recent candles for entry signals
    for (const symbol of run.symbols) {
      const candles = recentCandles[symbol] || [];
      if (candles.length === 0) {
        console.log(`⏭️  Skipping ${symbol} - no recent candle data`);
        continue;
      }

      console.log(`   📊 Processing ${candles.length} recent candles for ${symbol}`);

      // Process candles like the backtest does - check if we haven't processed this candle before
      const lastProcessedCandle = await getLastProcessedCandle(run.run_id, symbol);

      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // Skip candles we've already processed
        if (lastProcessedCandle && new Date(candle.ts) <= new Date(lastProcessedCandle)) {
          continue;
        }

        // Process this candle for entry signals
        await this.processSymbolEntrySignals(run, symbol, candle, strategy);

        // Mark this candle as processed
        await updateLastProcessedCandle(run.run_id, symbol, candle.ts);

        // Only process one new candle per symbol per cycle to avoid spam
        // This ensures we don't flood with signals on startup
        break;
      }
    }
    
    // Update run's last update timestamp and check if winding down run should be stopped
    if (run.status === 'winding_down') {
      // Get current positions to check if all are closed
      const allPositionsV2 = await getOpenPositionsV2(run.run_id);
      
      if (allPositionsV2.length === 0) {
        console.log(`✅ All positions closed for winding down run ${run.run_id}, stopping run`);
        await updateRunStatus(run.run_id, 'stopped', 'All positions closed during wind down');
      } else {
        console.log(`🔄 Winding down run ${run.run_id} has ${allPositionsV2.length} open positions remaining`);
        await updateRunStatus(run.run_id, 'winding_down');
      }
    } else {
      await updateRunStatus(run.run_id, 'active');
    }
  }

  private async updateExistingPositions(run: FakeTradeRun, livePrices: Record<string, number>) {
    const positionsV2 = await getOpenPositionsV2(run.run_id);
    
    if (positionsV2.length === 0) {
      return;
    }
    
    console.log(`   📍 Updating ${positionsV2.length} open positions with live prices`);
    
    // If there are too many positions, it indicates a problem - don't spam logs
    const verboseLogging = positionsV2.length <= 10;
    let updatedCount = 0;
    
    for (const position of positionsV2) {
      const livePrice = livePrices[position.symbol];
      if (!livePrice) {
        if (verboseLogging) {
          console.log(`   ⚠️  No live price for ${position.symbol}, keeping current price`);
        }
        continue;
      }
      
      // Record PriceSnapshot for canonical model
      await createPriceSnapshot({
        run_id: run.run_id,
        ts: new Date().toISOString(),
        symbol: position.symbol,
        price: livePrice,
      });
      
      if (verboseLogging && position.entry_price_vwap) {
        const unrealizedPnl = this.calculateUnrealizedPnLV2(position, livePrice);
        console.log(`   📊 Updated ${position.symbol}: $${position.entry_price_vwap.toFixed(2)} → $${livePrice.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
        
        // Logging Contract: POSITION_MARK event
        await logPositionMark(run.run_id, position, livePrice, unrealizedPnl);
      }
      
      updatedCount++;
      
      // Check for exit conditions using live prices
      await this.checkExitConditions(run, position, livePrice);
    }
    
    if (!verboseLogging) {
      console.log(`   ✅ Updated ${updatedCount} positions (logging reduced due to high position count)`);
    }

    // Update run capital to include real-time unrealized P&L
    await this.updateRunCapital(run);
  }

  /**
   * Update run capital based on realized PnL and fees only
   * PnL and Fees Rule: Equity changes only on realized events
   * Capital = starting_capital - total_fees_paid + realized_pnl
   * Unrealized PnL is NOT included in capital (only for display/reporting)
   */
  private async updateRunCapital(run: FakeTradeRun) {
    // Get all fills to calculate total fees paid
    const fillsResult = await pool.query(`
      SELECT SUM(fee) as total_fees
      FROM ft_fills
      WHERE run_id = $1
    `, [run.run_id]);
    
    const totalFeesPaid = Number(fillsResult.rows[0]?.total_fees || 0);
    
    // Get realized PnL from closed positions only
    const closedPositionsResult = await pool.query(`
      SELECT SUM(realized_pnl) as total_realized_pnl
      FROM ft_positions_v2
      WHERE run_id = $1 AND status = 'CLOSED'
    `, [run.run_id]);
    
    const totalRealizedPnl = Number(closedPositionsResult.rows[0]?.total_realized_pnl || 0);
    
    // Capital = starting capital - fees paid + realized PnL
    // Note: Unrealized PnL is NOT included (equity changes only on realized events)
    const capital = Number(run.starting_capital) - totalFeesPaid + totalRealizedPnl;
    
    // Update the run's current capital
    await updateRunCapital(run.run_id, capital);
    run.current_capital = capital; // Update local copy
  }

  /**
   * Calculate unrealized PnL from mark price (current market price)
   * This is computed on-the-fly and never stored
   */
  private calculateUnrealizedPnLV2(position: PositionV2, markPrice: number): number {
    if (!position.entry_price_vwap) return 0;
    
    if (position.side === 'LONG') {
      return (markPrice - position.entry_price_vwap) * position.quantity_open;
    } else {
      return (position.entry_price_vwap - markPrice) * position.quantity_open;
    }
  }

  private async checkExitConditions(run: FakeTradeRun, positionV2: PositionV2, currentPrice: number) {
    let shouldExit = false;
    let exitReason = '';
    
    // Check time-based exit (close positions older than 24 hours)
    const hoursOpen = (new Date().getTime() - new Date(positionV2.open_ts).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 24) {
      shouldExit = true;
      exitReason = 'time_based_exit';
    }
    
    // Note: Stop loss and take profit would need to be stored in PositionV2
    // For now, we'll rely on strategy-generated exit signals
    
    if (shouldExit) {
      console.log(`   🎯 Exit triggered for ${positionV2.symbol}: ${exitReason} at $${currentPrice.toFixed(2)}`);
      
      const now = new Date().toISOString();
      
      // Create EXIT Order
      const exitOrderId = await createOrder({
        position_id: positionV2.position_id,
        run_id: run.run_id,
        symbol: positionV2.symbol,
        ts: now,
        side: positionV2.side,
        type: 'EXIT',
        qty: positionV2.quantity_open, // Exit full position
        price: currentPrice,
        status: 'NEW',
        reason_tag: exitReason,
        rejection_reason: undefined,
      });
      
      // Logging Contract: ORDER_NEW event
      const exitOrder = await getOrder(exitOrderId);
      if (exitOrder) {
        await logOrderNew(run.run_id, exitOrder);
      }
      
      // Create Fill for exit
      const exitFees = positionV2.quantity_open * currentPrice * 0.0004; // 0.04% fees
      const exitFillId = await createFill({
        order_id: exitOrderId,
        position_id: positionV2.position_id,
        run_id: run.run_id,
        symbol: positionV2.symbol,
        ts: now,
        qty: positionV2.quantity_open,
        price: currentPrice,
        fee: exitFees,
      });
      
      // Logging Contract: FILL event
      const exitFill = await getFill(exitFillId);
      if (exitFill && exitOrder) {
        await logFill(run.run_id, exitFill, exitOrder);
      }
      
      // Update Order status based on fills (Order FSM: NEW → PARTIAL → FILLED)
      // createFill already calls updateOrderStatusFromFills, but we'll ensure it's updated
      const orderStatusUpdate = await updateOrderStatusFromFills(exitOrderId);
      if (orderStatusUpdate) {
        // Logging Contract: ORDER_UPDATE event
        await logOrderUpdate(run.run_id, exitOrderId, orderStatusUpdate.oldStatus, orderStatusUpdate.newStatus, now);
      }
      
      // Close PositionV2 (will recompute PnL from fills and handle status transition)
      const positionStatusUpdate = await updatePositionFromFills(positionV2.position_id);
      await closePositionV2(positionV2.position_id, now);
      
      // Logging Contract: POSITION_CLOSED event
      const closedPosition = await getPositionV2(positionV2.position_id);
      if (closedPosition) {
        await logPositionClosed(run.run_id, closedPosition, currentPrice);
      }
      
      // Record PriceSnapshot
      await createPriceSnapshot({
        run_id: run.run_id,
        ts: now,
        symbol: positionV2.symbol,
        price: currentPrice,
      });
      
      // PnL and Fees Rule: Equity changes only on realized events
      // Update capital when position closes (realized PnL is now included)
      await this.updateRunCapital(run);
      
      console.log(`   ✅ Closed ${positionV2.symbol} position: Order ${exitOrderId.substring(0, 8)}... Fill ${exitFillId.substring(0, 8)}... (Capital: $${run.current_capital.toFixed(2)})`);
    }
  }

  private async processSymbolEntrySignals(
    run: FakeTradeRun, 
    symbol: string, 
    candle: Candle, 
    strategy: Function
  ) {
    console.log(`\n  📊 Evaluating entry signals for ${symbol} @ $${candle.close} (${run.timeframe} candle: ${candle.ts})`);
    
    // Get current positions V2 for this symbol
    const positionsV2 = await getOpenPositionsV2(run.run_id);
    const symbolPositionsV2 = positionsV2.filter(p => p.symbol === symbol);
    
    // Convert PositionV2 to format expected by strategy (for compatibility)
    // Strategy expects FakePosition format, but we'll adapt
    const symbolPositions = symbolPositionsV2.map(p => ({
      symbol: p.symbol,
      side: p.side,
      size: p.quantity_open,
      entry_price: p.entry_price_vwap || 0,
      status: p.status.toLowerCase() as 'open',
    }));
    
    // Prepare strategy state
    const strategyState = {
      runId: run.run_id,
      symbol: symbol,
      currentCapital: run.current_capital,
      positions: symbolPositions,
      timeframe: run.timeframe
    };
    
    // Generate trading signals
    const signals = strategy(candle, strategyState, run.params);
    
    // Execute entry signals (but skip if winding down)
    for (const signal of signals) {
      // If run is winding down, only allow exit signals
      if (run.status === 'winding_down' && (signal.side === 'LONG' || signal.side === 'SHORT')) {
        console.log(`     🚫 Skipping entry signal for ${signal.symbol} - run is winding down`);
        
        // Log the skipped signal
        await logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: 'winding_down_no_new_positions',
          signal_ts: new Date().toISOString()
        });
        
        // Logging Contract: STRATEGY_NOTE event
        await logStrategyNote(run.run_id, new Date().toISOString(), `Signal rejected: run is winding down`, {
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          reason: signal.reason,
        });
        
        continue; // Skip this signal
      }
      
      // Only process entry signals here (exit signals handled in position management)
      if (signal.side === 'LONG' || signal.side === 'SHORT') {
        await this.executeEntrySignal(run, signal, candle);
      }
    }
    
    // Log signal for debugging (even if no signals)
    if (signals.length === 0) {
      await logSignal({
        run_id: run.run_id,
        symbol: symbol,
        signal_type: 'entry',
        candle_data: candle,
        strategy_state: strategyState,
        rejection_reason: 'no_entry_signal_generated',
        executed: false,
        signal_ts: new Date().toISOString()
      });
    }
  }


  private async executeEntrySignal(run: FakeTradeRun, signal: any, candle: Candle) {
    console.log(`     🎯 Entry Signal: ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${candle.close} (${signal.reason})`);
    
    try {
      // Check position limits BEFORE executing
      const currentPositionsV2 = await getOpenPositionsV2(run.run_id);
      
      if (currentPositionsV2.length >= run.max_concurrent_positions) {
        console.log(`     🚫 Position limit reached: ${currentPositionsV2.length}/${run.max_concurrent_positions} - skipping signal`);
        
        // Log the rejected signal
        await logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: `position_limit_reached_${currentPositionsV2.length}_of_${run.max_concurrent_positions}`,
          signal_ts: new Date().toISOString()
        });
        
        // Logging Contract: STRATEGY_NOTE event
        await logStrategyNote(run.run_id, new Date().toISOString(), `Signal rejected: position limit reached`, {
          symbol: signal.symbol,
          side: signal.side,
          reason: signal.reason,
          current_positions: currentPositionsV2.length,
          max_positions: run.max_concurrent_positions,
        });
        
        return; // Exit early - don't execute the signal
      }
      
      // Position Rules Enforcement:
      // 1. No overlapping long/short in same strategy context (always enforced)
      // 2. Single-position per symbol unless multi-mode enabled
      // 3. Enforce uniqueness constraints at database level
      
      // Rule 1: Always prevent overlapping LONG/SHORT positions
      const hasOverlap = await hasOverlappingPosition(run.run_id, signal.symbol, signal.side);
      if (hasOverlap) {
        console.log(`     🚫 Overlapping position detected for ${signal.symbol}: already have ${signal.side === 'LONG' ? 'SHORT' : 'LONG'} position - skipping new ${signal.side} signal`);
        
        // Log the rejected signal
        await logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: `overlapping_position_opposite_side_${signal.side === 'LONG' ? 'SHORT' : 'LONG'}`,
          signal_ts: new Date().toISOString()
        });
        
        // Logging Contract: STRATEGY_NOTE event
        await logStrategyNote(run.run_id, new Date().toISOString(), `Signal rejected: overlapping position detected`, {
          symbol: signal.symbol,
          side: signal.side,
          reason: signal.reason,
          overlap_side: signal.side === 'LONG' ? 'SHORT' : 'LONG',
        });
        
        return; // Exit early - don't execute the signal
      }
      
      // Rule 2: Single-position per symbol unless multi-mode enabled
      const allowMultiMode = run.allow_multiple_positions_per_symbol === true;
      if (!allowMultiMode) {
        const existingPositionV2 = await getOpenPositionV2BySymbol(run.run_id, signal.symbol);
        
        if (existingPositionV2) {
          console.log(`     🚫 Already have open position for ${signal.symbol} (${existingPositionV2.side} @ $${existingPositionV2.entry_price_vwap?.toFixed(4)}) - skipping new ${signal.side} signal (multi-mode disabled)`);
          
          // Log the rejected signal
          await logSignal({
            run_id: run.run_id,
            symbol: signal.symbol,
            signal_type: 'entry',
            side: signal.side,
            size: signal.size,
            price: signal.price,
            candle_data: candle,
            executed: false,
            rejection_reason: `existing_position_for_symbol_${existingPositionV2.side}_@_${existingPositionV2.entry_price_vwap?.toFixed(4)}_multi_mode_disabled`,
            signal_ts: new Date().toISOString()
          });
          
          // Logging Contract: STRATEGY_NOTE event
          await logStrategyNote(run.run_id, new Date().toISOString(), `Signal rejected: existing position for symbol (multi-mode disabled)`, {
            symbol: signal.symbol,
            side: signal.side,
            reason: signal.reason,
            existing_position_side: existingPositionV2.side,
            existing_position_entry_price: existingPositionV2.entry_price_vwap,
          });
          
          return; // Exit early - don't execute the signal
        }
      }
      // If multi-mode is enabled, we allow multiple positions of the same side
      // (overlapping positions are already prevented above)
      
      // Use 15-minute candle close price for execution (consistent with backtest)
      const executionPrice = candle.close; // Execute at 15m candle close price
      const positionValue = signal.size * executionPrice; // Total position value (margin * leverage)
      const marginRequired = positionValue / (signal.leverage || 1); // Margin you need to put up
      const fees = signal.size * executionPrice * 0.0004; // 0.04% fees

      if (run.current_capital < (marginRequired + fees)) {
        console.log(`     💸 Insufficient capital: need $${(marginRequired + fees).toFixed(2)}, have $${run.current_capital.toFixed(2)} - skipping signal`);

        // Log the rejected signal
        await logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: `insufficient_capital_need_${(marginRequired + fees).toFixed(2)}_have_${run.current_capital.toFixed(2)}`,
          signal_ts: new Date().toISOString()
        });

        // Logging Contract: STRATEGY_NOTE event
        await logStrategyNote(run.run_id, new Date().toISOString(), `Signal rejected: insufficient capital`, {
          symbol: signal.symbol,
          side: signal.side,
          reason: signal.reason,
          required_capital: marginRequired + fees,
          available_capital: run.current_capital,
        });

        return; // Exit early - don't execute the signal
      }
      
      // PnL and Fees Rule: Accurate fee tracking
      // Fees are deducted from capital when paid (entry and exit)
      // Margin is NOT deducted from capital (it's allocated to positions)
      // Capital = starting_capital - fees_paid + realized_pnl
      // Capital will be updated after fill is created (fees are tracked in fills)
      
      const now = new Date().toISOString();
      
      // Canonical Model: Create Order (trading intent)
      const orderId = await createOrder({
        position_id: undefined, // Will be set after position creation
        run_id: run.run_id,
        symbol: signal.symbol,
        ts: now,
        side: signal.side,
        type: 'ENTRY',
        qty: signal.size,
        price: executionPrice, // Intended price
        status: 'NEW',
        reason_tag: signal.reason,
        rejection_reason: undefined,
      });
      
      // Logging Contract: ORDER_NEW event
      const order = await getOrder(orderId);
      if (order) {
        await logOrderNew(run.run_id, order);
      }
      
      // Canonical Model: Create Fill (actual execution)
      const fillId = await createFill({
        order_id: orderId,
        position_id: undefined, // Will be set after position creation
        run_id: run.run_id,
        symbol: signal.symbol,
        ts: now,
        qty: signal.size,
        price: executionPrice, // Actual fill price
        fee: fees,
      });
      
      // Logging Contract: FILL event
      const fill = await getFill(fillId);
      if (fill && order) {
        await logFill(run.run_id, fill, order);
      }
      
      // Canonical Model: Create PositionV2 (aggregated view)
      // Position starts in NEW state (FSM: NEW → OPEN → CLOSED)
      const positionId = await createPositionV2({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        status: 'NEW', // Will transition to OPEN after first fill
        open_ts: now,
        close_ts: undefined,
        entry_price_vwap: executionPrice, // Will be recomputed from fills
        exit_price_vwap: undefined,
        quantity_open: signal.size,
        quantity_close: 0,
        cost_basis: marginRequired,
        fees_total: fees,
        realized_pnl: 0, // Computed from fills, never stored directly
        leverage_effective: signal.leverage || 1,
      });
      
      // Link Order and Fill to Position
      await linkOrderToPosition(orderId, positionId);
      await pool.query(
        'UPDATE ft_fills SET position_id = $1 WHERE fill_id = $2',
        [positionId, fillId]
      );
      
      // Update Order status based on fills (Order FSM: NEW → PARTIAL → FILLED)
      // createFill already calls updateOrderStatusFromFills, but we'll ensure it's updated
      const orderStatusUpdate = await updateOrderStatusFromFills(orderId);
      if (orderStatusUpdate) {
        // Logging Contract: ORDER_UPDATE event
        await logOrderUpdate(run.run_id, orderId, orderStatusUpdate.oldStatus, orderStatusUpdate.newStatus, now);
      }
      
      // Update Position metrics from fills (Position FSM: NEW → OPEN after first fill)
      const positionStatusUpdate = await updatePositionFromFills(positionId);
      
      // Logging Contract: POSITION_OPENED event (when position transitions from NEW to OPEN)
      if (positionStatusUpdate.statusChanged && positionStatusUpdate.newStatus === 'OPEN') {
        const position = await getPositionV2(positionId);
        if (position) {
          await logPositionOpened(run.run_id, position, executionPrice);
        }
      }
      
      // PnL and Fees Rule: Update capital after fees are paid
      // Fees are tracked in fills, so update capital to reflect fees deducted
      await this.updateRunCapital(run);
      
      // Record PriceSnapshot
      await createPriceSnapshot({
        run_id: run.run_id,
        ts: now,
        symbol: signal.symbol,
        price: executionPrice,
      });
      
      console.log(`     ✅ Opened ${signal.side} position: Order ${orderId.substring(0, 8)}... Fill ${fillId.substring(0, 8)}... Position ${positionId.substring(0, 8)}... (Capital: $${run.current_capital.toFixed(2)})`);
      
      // Log successful signal execution
      await logSignal({
        run_id: run.run_id,
        symbol: signal.symbol,
        signal_type: 'entry',
        side: signal.side,
        size: signal.size,
        price: signal.price,
        candle_data: candle,
        executed: true,
        execution_price: executionPrice,
        execution_notes: `Executed ${signal.reason}`,
        signal_ts: new Date().toISOString()
      });
      
      // Logging Contract: STRATEGY_NOTE event
      await logStrategyNote(run.run_id, now, `Entry signal executed: ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${executionPrice.toFixed(2)}`, {
        symbol: signal.symbol,
        side: signal.side,
        size: signal.size,
        execution_price: executionPrice,
        reason: signal.reason,
        order_id: orderId,
        fill_id: fillId,
        position_id: positionId,
      });
      
    } catch (error: any) {
      console.error(`     ❌ Entry signal execution failed:`, error.message);
      
      // Log failed signal execution
      await logSignal({
        run_id: run.run_id,
        symbol: signal.symbol,
        signal_type: 'entry',
        side: signal.side,
        size: signal.size,
        price: signal.price,
        candle_data: candle,
        executed: false,
        execution_notes: `Execution failed: ${error.message}`,
        signal_ts: new Date().toISOString()
      });
      
      // Logging Contract: STRATEGY_NOTE event
      await logStrategyNote(run.run_id, new Date().toISOString(), `Signal execution failed: ${error.message}`, {
        symbol: signal.symbol,
        side: signal.side,
        reason: signal.reason,
        error: error.message,
      });
    }
  }
}

// Start the fake trader
const trader = new FakeTrader();
trader.start().catch(error => {
  console.error('💥 Failed to start fake trader:', error);
  process.exit(1);
});
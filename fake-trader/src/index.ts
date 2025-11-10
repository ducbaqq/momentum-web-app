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
  getCurrentPositions,
  createTrade,
  createPosition,
  updatePosition,
  closePosition,
  logSignal,
  updateRunStatus,
  updateRunCapital,
  getTrades,
  pool
} from './db.js';
import { getStrategy } from './strategies.js';
import type { FakeTradeRun, Candle, FakePosition } from './types.js';

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
      
      // Get current positions for this run
      const positions = await getCurrentPositions(run.run_id);
      
      if (positions.length === 0) {
        return;
      }
      
      // Get current market data for position symbols
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const candles = await getCurrentCandles(symbols);
      
      // Update each position with current market price
      for (const position of positions) {
        const candle = candles[position.symbol];
        if (!candle) {
          console.log(`⚠️  No current data for ${position.symbol}, keeping stale price`);
          continue;
        }
        
        const unrealizedPnl = this.calculateUnrealizedPnL(position, candle.close);
        const marketValue = position.size * candle.close;
        
        await updatePosition(position.position_id, candle.close, unrealizedPnl, marketValue);
        
        console.log(`   📊 Updated ${position.symbol}: ${position.current_price} → ${candle.close} (P&L: ${unrealizedPnl.toFixed(2)})`);
      }
      
      console.log(`✅ Updated ${positions.length} stale positions for run ${run.run_id}`);
      
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
    const currentPositions = await getCurrentPositions(run.run_id);
    if (currentPositions.length > run.max_concurrent_positions * 2) {
      console.log(`   🚨 SAFETY: Too many positions (${currentPositions.length} vs limit ${run.max_concurrent_positions}) - stopping run and closing positions`);
      
      // Stop the run
      await updateRunStatus(run.run_id, 'stopped', `Safety stop: Too many open positions (${currentPositions.length} vs limit ${run.max_concurrent_positions})`);
      
      // Force close all positions  
      await pool.query(`UPDATE ft_positions SET status = 'closed' WHERE run_id = $1 AND status = 'open'`, [run.run_id]);
      console.log(`   🔄 Force closed ${currentPositions.length} positions`);
      
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
      const allPositions = await getCurrentPositions(run.run_id);
      const openPositionsCount = allPositions.filter(p => p.status === 'open').length;
      
      if (openPositionsCount === 0) {
        console.log(`✅ All positions closed for winding down run ${run.run_id}, stopping run`);
        await updateRunStatus(run.run_id, 'stopped', 'All positions closed during wind down');
      } else {
        console.log(`🔄 Winding down run ${run.run_id} has ${openPositionsCount} open positions remaining`);
        await updateRunStatus(run.run_id, 'winding_down');
      }
    } else {
      await updateRunStatus(run.run_id, 'active');
    }
  }

  private async updateExistingPositions(run: FakeTradeRun, livePrices: Record<string, number>) {
    const positions = await getCurrentPositions(run.run_id);
    
    if (positions.length === 0) {
      return;
    }
    
    console.log(`   📍 Updating ${positions.length} open positions with live prices`);
    
    // If there are too many positions, it indicates a problem - don't spam logs
    const verboseLogging = positions.length <= 10;
    let updatedCount = 0;
    
    for (const position of positions) {
      const livePrice = livePrices[position.symbol];
      if (!livePrice) {
        if (verboseLogging) {
          console.log(`   ⚠️  No live price for ${position.symbol}, keeping current price`);
        }
        continue;
      }
      
      const unrealizedPnl = this.calculateUnrealizedPnL(position, livePrice);
      const marketValue = position.size * livePrice;
      await updatePosition(position.position_id, livePrice, unrealizedPnl, marketValue);
      updatedCount++;
      
      if (verboseLogging) {
        const prevPrice = position.current_price ?? position.entry_price;
        console.log(`   📊 Updated ${position.symbol}: $${prevPrice?.toFixed(2) ?? 'N/A'} → $${livePrice.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
      }
      
      // Check for stop loss / take profit triggers using live prices
      await this.checkExitConditions(run, position, livePrice);
      // Note: We can't accurately count exits here since checkExitConditions doesn't return status
    }
    
    if (!verboseLogging) {
      console.log(`   ✅ Updated ${updatedCount} positions (logging reduced due to high position count)`);
    }

    // Update run capital to include real-time unrealized P&L
    await this.updateRunCapitalWithUnrealizedPnl(run);
  }

  private async updateRunCapitalWithUnrealizedPnl(run: FakeTradeRun) {
    // Get all positions and trades to calculate total P&L
    const positions = await getCurrentPositions(run.run_id);
    const trades = await getTrades(run.run_id);

    const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + Number(pos.unrealized_pnl), 0);
    const totalRealizedPnl = trades.filter(t => t.status === 'closed').reduce((sum, trade) => sum + Number(trade.realized_pnl), 0);

    // Get total fees paid for all trades (both open and closed)
    const totalFeesPaid = trades.reduce((sum, trade) => sum + Number(trade.fees), 0);

    // Get total margin currently invested in open positions
    const totalMarginInvested = positions.reduce((sum, pos) => sum + Number(pos.cost_basis), 0);

    // Real-time capital = starting capital - total fees paid + realized P&L + unrealized P&L
    // Note: margin invested is not subtracted because it's still allocated to positions and unrealized P&L reflects its current value
    const realTimeCapital = Number(run.starting_capital) - totalFeesPaid + totalRealizedPnl + totalUnrealizedPnl;

    // Update the run's current capital
    await updateRunCapital(run.run_id, realTimeCapital);
    run.current_capital = realTimeCapital; // Update local copy
  }

  private async checkExitConditions(run: FakeTradeRun, position: FakePosition, currentPrice: number) {
    let shouldExit = false;
    let exitReason = '';
    
    // Get position timeout from params (default 24 hours)
    const positionTimeoutHours = run.params?.positionTimeoutHours || 24;
    
    // Check time-based exit (close positions older than configured timeout)
    const hoursOpen = (new Date().getTime() - new Date(position.opened_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > positionTimeoutHours) {
      shouldExit = true;
      exitReason = 'time_based_exit';
    }
    
    // Check stop loss
    if (position.stop_loss && 
        ((position.side === 'LONG' && currentPrice <= position.stop_loss) ||
         (position.side === 'SHORT' && currentPrice >= position.stop_loss))) {
      shouldExit = true;
      exitReason = 'stop_loss_trigger';
    }
    
    // Check take profit
    if (position.take_profit && 
        ((position.side === 'LONG' && currentPrice >= position.take_profit) ||
         (position.side === 'SHORT' && currentPrice <= position.take_profit))) {
      shouldExit = true;
      exitReason = 'take_profit_trigger';
    }
    
    if (shouldExit) {
      console.log(`   🎯 Exit triggered for ${position.symbol}: ${exitReason} at $${currentPrice.toFixed(2)}`);
      
      const realizedPnl = this.calculateRealizedPnL(position, currentPrice);
      const fees = position.size * currentPrice * 0.0004; // 0.04% fees
      
      await closePosition(position.position_id, currentPrice, realizedPnl);

      // Update run capital - add back margin + realized P&L - fees
      // For leverage: margin was deducted on open, add it back + P&L on leveraged position
      const newCapital = run.current_capital + position.cost_basis + realizedPnl - fees;
      await updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy
      
      console.log(`   ✅ Closed ${position.symbol} position: P&L $${realizedPnl.toFixed(2)} (fees: $${fees.toFixed(2)}) (Capital: $${run.current_capital.toFixed(2)})`);
    }
  }

  private async processSymbolEntrySignals(
    run: FakeTradeRun, 
    symbol: string, 
    candle: Candle, 
    strategy: Function
  ) {
    console.log(`\n  📊 Evaluating entry signals for ${symbol} @ $${candle.close} (${run.timeframe} candle: ${candle.ts})`);
    
    // Get current positions for this symbol
    const positions = await getCurrentPositions(run.run_id);
    const symbolPositions = positions.filter(p => p.symbol === symbol);
    
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
    
      // Process signals - distinguish between entry and exit signals
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
          
          continue; // Skip this signal
        }
        
        // Check if this is an exit signal (opposite side of existing position)
        const existingPosition = symbolPositions.find(p => p.status === 'open');
        const isExitSignal = existingPosition && 
          ((existingPosition.side === 'LONG' && signal.side === 'SHORT') ||
           (existingPosition.side === 'SHORT' && signal.side === 'LONG'));
        
        if (isExitSignal) {
          // This is an exit signal - close the existing position
          console.log(`     🚪 Exit Signal: Closing ${existingPosition.side} position for ${signal.symbol} (reason: ${signal.reason})`);
          
          const exitPrice = candle.close;
          const realizedPnl = this.calculateRealizedPnL(existingPosition, exitPrice);
          const fees = existingPosition.size * exitPrice * 0.0004; // 0.04% fees
          
          await closePosition(existingPosition.position_id, exitPrice, realizedPnl);
          
          // Update run capital - add back margin + realized P&L - fees
          const newCapital = run.current_capital + existingPosition.cost_basis + realizedPnl - fees;
          await updateRunCapital(run.run_id, newCapital);
          run.current_capital = newCapital; // Update local copy
          
          console.log(`     ✅ Closed ${existingPosition.side} position: P&L $${realizedPnl.toFixed(2)} (fees: $${fees.toFixed(2)}) (Capital: $${run.current_capital.toFixed(2)})`);
          
          // Log the exit signal
          await logSignal({
            run_id: run.run_id,
            symbol: signal.symbol,
            signal_type: 'exit',
            side: signal.side,
            size: signal.size,
            price: signal.price,
            candle_data: candle,
            executed: true,
            execution_price: exitPrice,
            execution_notes: `Closed ${existingPosition.side} position: ${signal.reason}`,
            signal_ts: new Date().toISOString()
          });
          
        } else if (signal.side === 'LONG' || signal.side === 'SHORT') {
          // This is an entry signal - open new position
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
      // Prevent SHORT positions (staging only - long-only trading)
      if (signal.side === 'SHORT') {
        console.log(`     🚫 SHORT positions are disabled - skipping signal`);
        
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
          rejection_reason: 'short_positions_disabled',
          signal_ts: new Date().toISOString()
        });
        
        return; // Exit early - don't execute the signal
      }
      
      // Check position limits BEFORE executing
      const currentPositions = await getCurrentPositions(run.run_id);
      if (currentPositions.length >= run.max_concurrent_positions) {
        console.log(`     🚫 Position limit reached: ${currentPositions.length}/${run.max_concurrent_positions} - skipping signal`);
        
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
          rejection_reason: `position_limit_reached_${currentPositions.length}_of_${run.max_concurrent_positions}`,
          signal_ts: new Date().toISOString()
        });
        
        return; // Exit early - don't execute the signal
      }
      
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

        return; // Exit early - don't execute the signal
      }
      
      // Update run capital - reduce by margin required + fees when opening position
      const newCapital = run.current_capital - marginRequired - fees;
      await updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy
      
      // Create new trade and position
      const tradeId = await createTrade({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        entry_ts: new Date().toISOString(),
        qty: signal.size,
        entry_px: executionPrice,
        realized_pnl: 0,
        unrealized_pnl: 0,
        fees: fees,
        reason: signal.reason,
        leverage: signal.leverage || 1,
        status: 'open'
      });
      
      await createPosition({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        size: signal.size,
        entry_price: executionPrice,
        current_price: executionPrice,
        unrealized_pnl: 0,
        cost_basis: marginRequired, // Store margin amount, not full position value
        market_value: signal.size * executionPrice,
        stop_loss: signal.stopLoss,
        take_profit: signal.takeProfit,
        leverage: signal.leverage || 1,
        status: 'open'
      });
      
      console.log(`     ✅ Opened ${signal.side} position: ${tradeId.substring(0, 8)}... (Capital: $${run.current_capital.toFixed(2)})`);
      
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
    }
  }

  private async executeSignal(run: FakeTradeRun, signal: any, candle: Candle) {
    console.log(`     🎯 Signal: ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${candle.close} (${signal.reason})`);
    
    try {
      const executionPrice = candle.close; // Simplified execution at current price
      const fees = signal.size * executionPrice * 0.0004; // 0.04% fees
      
      if (signal.side === 'LONG' || signal.side === 'SHORT') {
        // Entry signal - check limits first
        const currentPositions = await getCurrentPositions(run.run_id);
        if (currentPositions.length >= run.max_concurrent_positions) {
          console.log(`     🚫 Position limit reached: ${currentPositions.length}/${run.max_concurrent_positions} - skipping signal`);
          return; // Exit early
        }
        
        const positionCost = signal.size * executionPrice; // Cost of opening the position
        
        if (run.current_capital < (positionCost + fees)) {
          console.log(`     💸 Insufficient capital: need $${(positionCost + fees).toFixed(2)}, have $${run.current_capital.toFixed(2)} - skipping signal`);
          return; // Exit early
        }
        
        // Update run capital - reduce by position cost + fees when opening position
        const newCapital = run.current_capital - positionCost - fees;
        await updateRunCapital(run.run_id, newCapital);
        run.current_capital = newCapital; // Update local copy
        
        const tradeId = await createTrade({
          run_id: run.run_id,
          symbol: signal.symbol,
          side: signal.side,
          entry_ts: new Date().toISOString(),
          qty: signal.size,
          entry_px: executionPrice,
          realized_pnl: 0,
          unrealized_pnl: 0,
          fees: fees,
          reason: signal.reason,
          leverage: signal.leverage || 1,
          status: 'open'
        });
        
        await createPosition({
          run_id: run.run_id,
          symbol: signal.symbol,
          side: signal.side,
          size: signal.size,
          entry_price: executionPrice,
          current_price: executionPrice,
          unrealized_pnl: 0,
          cost_basis: signal.size * executionPrice,
          market_value: signal.size * executionPrice,
          stop_loss: signal.stopLoss,
          take_profit: signal.takeProfit,
          leverage: signal.leverage || 1,
          status: 'open'
        });
        
        console.log(`     ✅ Opened ${signal.side} position: ${tradeId.substring(0, 8)}... (Capital: $${run.current_capital.toFixed(2)})`);
        
      } else {
        // Exit signal - close existing position
        const positions = await getCurrentPositions(run.run_id);
        const position = positions.find(p => p.symbol === signal.symbol && p.status === 'open');
        
        if (position) {
          const realizedPnl = this.calculateRealizedPnL(position, executionPrice);
          const positionValue = position.size * executionPrice; // Value received from closing position
          await closePosition(position.position_id, executionPrice, realizedPnl);
          
          console.log(`     ✅ Closed position: P&L $${realizedPnl.toFixed(2)}`);
          
          // Update run capital - add back position value and subtract fees
          const newCapital = run.current_capital + positionValue - fees;
          await updateRunCapital(run.run_id, newCapital);
          run.current_capital = newCapital; // Update local copy
          
          console.log(`     💰 Capital updated: $${run.current_capital.toFixed(2)}`);
        }
      }
      
      // Log successful signal execution
      await logSignal({
        run_id: run.run_id,
        symbol: signal.symbol,
        signal_type: signal.side === 'LONG' || signal.side === 'SHORT' ? 'entry' : 'exit',
        side: signal.side,
        size: signal.size,
        price: signal.price,
        candle_data: candle,
        executed: true,
        execution_price: executionPrice,
        execution_notes: `Executed ${signal.reason}`,
        signal_ts: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error(`     ❌ Signal execution failed:`, error.message);
      
      // Log failed signal execution
      await logSignal({
        run_id: run.run_id,
        symbol: signal.symbol,
        signal_type: signal.side === 'LONG' || signal.side === 'SHORT' ? 'entry' : 'exit',
        side: signal.side,
        size: signal.size,
        price: signal.price,
        candle_data: candle,
        executed: false,
        execution_notes: `Execution failed: ${error.message}`,
        signal_ts: new Date().toISOString()
      });
    }
  }

  private calculateUnrealizedPnL(position: FakePosition, currentPrice: number): number {
    if (position.side === 'LONG') {
      return (currentPrice - position.entry_price) * position.size;
    } else {
      return (position.entry_price - currentPrice) * position.size;
    }
  }

  private calculateRealizedPnL(position: FakePosition, exitPrice: number): number {
    if (position.side === 'LONG') {
      return (exitPrice - position.entry_price) * position.size;
    } else {
      return (position.entry_price - exitPrice) * position.size;
    }
  }
}

// Start the fake trader
const trader = new FakeTrader();
trader.start().catch(error => {
  console.error('💥 Failed to start fake trader:', error);
  process.exit(1);
});
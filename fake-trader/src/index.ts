import dotenv from 'dotenv';
import cron from 'node-cron';
import { 
  testConnection, 
  getActiveRuns, 
  getCurrentCandles,
  getCompleted15mCandles,
  getLivePrices,
  hasNew15mCandles,
  getLastProcessedCandle,
  updateLastProcessedCandle,
  getCurrentPositions,
  createTrade,
  createPosition,
  updatePosition,
  closePosition,
  logSignal,
  updateRunStatus,
  updateRunCapital
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
    
    // Get live prices for position management (always needed)
    const livePrices = await getLivePrices(run.symbols);
    
    // Update existing positions with current prices
    await this.updateExistingPositions(run, livePrices);
    
    // Check if new 15m candles are available for entry signal evaluation
    const lastProcessedCandle = await getLastProcessedCandle(run.run_id);
    const hasNewCandles = await hasNew15mCandles(run.symbols, lastProcessedCandle || undefined);
    
    if (hasNewCandles) {
      console.log(`   📊 New 15m candle(s) available - evaluating entry signals`);
      
      // Get completed 15m candles for entry signal evaluation
      const completed15mCandles = await getCompleted15mCandles(run.symbols);
      
      // Check if we have data for all symbols
      const missingData = run.symbols.filter(symbol => !completed15mCandles[symbol]);
      if (missingData.length > 0) {
        console.log(`⚠️  Missing 15m candle data for symbols: ${missingData.join(', ')}`);
      }
      
      // Get strategy function
      const strategy = getStrategy(run.strategy_name);
      
      // Process each symbol for entry signals
      for (const symbol of run.symbols) {
        const candle = completed15mCandles[symbol];
        if (!candle) {
          console.log(`⏭️  Skipping ${symbol} - no 15m candle data`);
          continue;
        }
        
        await this.processSymbolEntrySignals(run, symbol, candle, strategy);
        
        // Update last processed candle timestamp
        await updateLastProcessedCandle(run.run_id, candle.ts);
      }
    } else {
      console.log(`   ⏸️  No new 15m candles - only updating positions with live prices`);
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
    
    for (const position of positions) {
      const livePrice = livePrices[position.symbol];
      if (!livePrice) {
        console.log(`   ⚠️  No live price for ${position.symbol}, keeping current price`);
        continue;
      }
      
      const unrealizedPnl = this.calculateUnrealizedPnL(position, livePrice);
      const marketValue = position.size * livePrice;
      await updatePosition(position.position_id, livePrice, unrealizedPnl, marketValue);
      
      const prevPrice = position.current_price ?? position.entry_price;
      console.log(`   📊 Updated ${position.symbol}: $${prevPrice?.toFixed(2) ?? 'N/A'} → $${livePrice.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
      
      // Check for stop loss / take profit triggers using live prices
      await this.checkExitConditions(run, position, livePrice);
    }
  }

  private async checkExitConditions(run: FakeTradeRun, position: FakePosition, currentPrice: number) {
    let shouldExit = false;
    let exitReason = '';
    
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
      const positionValue = position.size * currentPrice; // Value received from closing position
      
      await closePosition(position.position_id, currentPrice, realizedPnl);
      
      // Update run capital - add back position value and subtract fees
      // Note: realizedPnl is already the difference, so we add position cost basis + realizedPnl - fees
      const newCapital = run.current_capital + positionValue - fees;
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
    console.log(`\n  📊 Evaluating entry signals for ${symbol} @ $${candle.close} (15m candle: ${candle.ts})`);
    
    // Get current positions for this symbol
    const positions = await getCurrentPositions(run.run_id);
    const symbolPositions = positions.filter(p => p.symbol === symbol);
    
    // Prepare strategy state
    const strategyState = {
      runId: run.run_id,
      symbol: symbol,
      currentCapital: run.current_capital,
      positions: symbolPositions
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
      const executionPrice = candle.close; // Execute at 15m candle close price
      const fees = signal.size * executionPrice * 0.0004; // 0.04% fees
      const positionCost = signal.size * executionPrice; // Cost of opening the position
      
      // Update run capital - reduce by position cost + fees when opening position
      const newCapital = run.current_capital - positionCost - fees;
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
        cost_basis: signal.size * executionPrice,
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
        // Entry signal - create new trade and position
        const positionCost = signal.size * executionPrice; // Cost of opening the position
        
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
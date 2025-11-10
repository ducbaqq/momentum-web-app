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
  linkOrderToPosition,
  updatePositionFromFills,
  closePositionV2,
  getOpenPositionsV2,
  getOpenPositionV2BySymbol,
  getFillsForPosition,
  getPositionV2,
  updatePositionFromFills as recalculatePositionFromFills
} from './canonical-db.js';
import { getStrategy } from './strategies.js';
import type { FakeTradeRun, Candle, PositionV2 } from './types.js';

// Load environment variables
dotenv.config();

class FakeTrader {
  private running = false;

  async start() {
    console.log('🚀 Starting Fake Trader (Canonical Model)...');
    
    // Test database connection
    await testConnection();
    
    // Check for downtime recovery
    await this.handleDowntimeRecovery();
    
    // Schedule trading execution every 1 minute
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
      const activeRuns = await getActiveRuns();
      const now = new Date();
      
      for (const run of activeRuns) {
        const lastUpdate = new Date(run.last_update || now.toISOString());
        const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
        
        if (minutesSinceUpdate > 5) {
          console.log(`⚠️  Run ${run.run_id} missed ${Math.floor(minutesSinceUpdate)} cycles during downtime`);
          await this.refreshStalePositions(run);
          
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
      
      console.log(`✅ Downtime recovery completed for ${activeRuns.length} active runs (V2)`);
    } catch (error) {
      console.error('❌ Downtime recovery failed:', error);
    }
  }

  private async refreshStalePositions(run: FakeTradeRun) {
    try {
      console.log(`🔄 Refreshing stale positions for run ${run.run_id} (V2)`);
      
      const positions = await getOpenPositionsV2(run.run_id);
      
      if (positions.length === 0) {
        return;
      }
      
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const candles = await getCurrentCandles(symbols);
      
      for (const position of positions) {
        const candle = candles[position.symbol];
        if (!candle) {
          console.log(`⚠️  No current data for ${position.symbol}, keeping stale price`);
          continue;
        }
        
        // Recalculate position from fills (canonical model)
        await recalculatePositionFromFills(position.position_id);
      }
    } catch (error) {
      console.error('❌ Failed to refresh stale positions:', error);
    }
  }

  private async executeTradingCycle() {
    const activeRuns = await getActiveRunsV2();
    
    if (activeRuns.length === 0) {
      return;
    }
    
    console.log(`\n📊 Processing ${activeRuns.length} active run(s)`);
    
    for (const run of activeRuns) {
      await this.processRun(run);
    }
  }

  private async processRun(run: FakeTradeRun) {
    console.log(`\n🎯 Processing run: ${run.name || run.run_id}`);
    console.log(`   Strategy: ${run.strategy_name}${run.strategy_version ? ` v${run.strategy_version}` : ''}`);
    console.log(`   Symbols: ${run.symbols.join(', ')}`);
    console.log(`   Capital: $${run.current_capital}`);
    
    // Bankruptcy protection
    if (run.current_capital < 0) {
      console.log(`   💸 BANKRUPTCY: Capital is negative ($${run.current_capital.toFixed(2)}) - stopping run`);
      await updateRunStatus(run.run_id, 'stopped', `Bankruptcy protection: Capital went negative ($${run.current_capital.toFixed(2)})`);
      return;
    }
    
    // Safety check
    const currentPositions = await getOpenPositionsV2(run.run_id);
    if (currentPositions.length > run.max_concurrent_positions * 2) {
      console.log(`   🚨 SAFETY: Too many positions (${currentPositions.length} vs limit ${run.max_concurrent_positions}) - stopping run`);
      await updateRunStatus(run.run_id, 'stopped', `Safety stop: Too many open positions (${currentPositions.length} vs limit ${run.max_concurrent_positions})`);
      // Force close all positions using canonical model
      for (const position of currentPositions) {
        const fills = await getFillsForPosition(position.position_id);
        if (fills.length > 0) {
          const lastFill = fills[fills.length - 1];
          // Create EXIT order and fill to close
          const exitOrderId = await createOrder({
            run_id: run.run_id,
            symbol: position.symbol,
            ts: new Date().toISOString(),
            side: position.side,
            type: 'EXIT',
            qty: position.quantity_open,
            price: lastFill.price,
            status: 'NEW',
            reason_tag: 'safety_stop',
            position_id: position.position_id,
          });
          await linkOrderToPosition(exitOrderId, position.position_id);
          await createFill({
            order_id: exitOrderId,
            run_id: run.run_id,
            symbol: position.symbol,
            ts: new Date().toISOString(),
            qty: position.quantity_open,
            price: lastFill.price,
            fee: position.quantity_open * lastFill.price * 0.0004,
            position_id: position.position_id,
          });
          await updatePositionFromFills(position.position_id);
          await closePositionV2(position.position_id, new Date().toISOString());
        }
      }
      return;
    }
    
    // Get live prices for position management
    const livePrices = await getLivePrices(run.symbols);
    
    // Update existing positions with current prices
    await this.updateExistingPositions(run, livePrices);
    
    // Get recent candles at the configured timeframe
    console.log(`   📊 Evaluating entry signals using recent ${run.timeframe} candles`);
    
    const lookbackMinutes = 300;
    const recentCandles = await getRecentCandles(run.symbols, lookbackMinutes, run.timeframe);
    const strategy = getStrategy('momentum_breakout_v2');
    
    // Process each symbol's recent candles for entry signals
    for (const symbol of run.symbols) {
      const candles = recentCandles[symbol] || [];
      if (candles.length === 0) {
        console.log(`⏭️  Skipping ${symbol} - no recent candle data`);
        continue;
      }
      
      console.log(`   📊 Processing ${candles.length} recent candles for ${symbol}`);
      
      const lastProcessedCandle = await getLastProcessedCandle(run.run_id, symbol);
      
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        
        if (lastProcessedCandle && new Date(candle.ts) <= new Date(lastProcessedCandle)) {
          continue;
        }
        
        await this.processSymbolEntrySignals(run, symbol, candle, strategy);
        await updateLastProcessedCandle(run.run_id, symbol, candle.ts);
        break; // Only process one new candle per symbol per cycle
      }
    }
    
    // Update run status
    if (run.status === 'winding_down') {
      const allPositions = await getOpenPositionsV2(run.run_id);
      const openPositionsCount = allPositions.filter(p => p.status === 'OPEN').length;
      
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
    const positions = await getOpenPositionsV2(run.run_id);
    
    if (positions.length === 0) {
      return;
    }
    
    console.log(`   📍 Updating ${positions.length} open positions with live prices (V2)`);
    
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
      
      // Recalculate position from fills (canonical model updates positions from fills)
      await recalculatePositionFromFills(position.position_id);
      updatedCount++;
      
      if (verboseLogging) {
        const entryPrice = position.entry_price_vwap || 0;
        console.log(`   📊 Updated ${position.symbol}: entry $${entryPrice.toFixed(2)} → current $${livePrice.toFixed(2)}`);
      }
      
      // Check for stop loss / take profit triggers
      await this.checkExitConditions(run, position, livePrice);
    }
    
    if (!verboseLogging) {
      console.log(`   ✅ Updated ${updatedCount} positions (logging reduced due to high position count)`);
    }
    
    // Update run capital
    await this.updateRunCapitalWithUnrealizedPnl(run);
  }

  private async updateRunCapitalWithUnrealizedPnl(run: FakeTradeRun) {
    const positions = await getOpenPositionsV2(run.run_id);
    
    if (positions.length === 0) {
      return;
    }
    
    // Get current prices for all position symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const livePrices = await getLivePrices(symbols);
    
    // Calculate total unrealized P&L from open positions
    let totalUnrealizedPnl = 0;
    let totalFeesPaid = 0;
    
    for (const position of positions) {
      const currentPrice = livePrices[position.symbol];
      if (!currentPrice || !position.entry_price_vwap) {
        continue;
      }
      
      // Calculate unrealized P&L
      let unrealizedPnl = 0;
      if (position.side === 'LONG') {
        unrealizedPnl = (currentPrice - position.entry_price_vwap) * position.quantity_open;
      } else {
        unrealizedPnl = (position.entry_price_vwap - currentPrice) * position.quantity_open;
      }
      
      totalUnrealizedPnl += unrealizedPnl;
      
      // Get fees from fills
      const fills = await getFillsForPosition(position.position_id);
      totalFeesPaid += fills.reduce((sum, fill) => sum + Number(fill.fee), 0);
    }
    
    // Real-time capital calculation
    // Starting capital - fees paid + unrealized P&L
    const realTimeCapital = Number(run.starting_capital) - totalFeesPaid + totalUnrealizedPnl;
    
    await updateRunCapital(run.run_id, realTimeCapital);
    run.current_capital = realTimeCapital;
  }

  private async checkExitConditions(run: FakeTradeRun, position: PositionV2, currentPrice: number) {
    let shouldExit = false;
    let exitReason = '';
    
    const positionTimeoutHours = run.params?.positionTimeoutHours || 24;
    
    // Check time-based exit
    const hoursOpen = (new Date().getTime() - new Date(position.open_ts).getTime()) / (1000 * 60 * 60);
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
      
      // Create EXIT order
      const exitOrderId = await createOrder({
        run_id: run.run_id,
        symbol: position.symbol,
        ts: new Date().toISOString(),
        side: position.side,
        type: 'EXIT',
        qty: position.quantity_open,
        price: currentPrice,
        status: 'NEW',
        reason_tag: exitReason,
        position_id: position.position_id,
      });
      
      // Link order to position
      await linkOrderToPosition(exitOrderId, position.position_id);
      
      // Create EXIT fill
      const fees = position.quantity_open * currentPrice * 0.0004;
      await createFill({
        order_id: exitOrderId,
        run_id: run.run_id,
        symbol: position.symbol,
        ts: new Date().toISOString(),
        qty: position.quantity_open,
        price: currentPrice,
        fee: fees,
        position_id: position.position_id,
      });
      
      // Update position from fills (this recalculates everything)
      await updatePositionFromFills(position.position_id);
      
      // Close position (mark as CLOSED)
      await closePositionV2(position.position_id, new Date().toISOString());
      
      // Get updated position to get realized P&L (position is now closed, so use getPositionV2)
      const updatedPosition = await getPositionV2(position.position_id);
      
      if (updatedPosition) {
        const fills = await getFillsForPosition(position.position_id);
        const totalFees = fills.reduce((sum, fill) => sum + Number(fill.fee), 0);
        const realizedPnl = updatedPosition.realized_pnl;
        
        const newCapital = run.current_capital + position.cost_basis + realizedPnl - totalFees;
        await updateRunCapital(run.run_id, newCapital);
        run.current_capital = newCapital;
        
        console.log(`     ✅ Closed ${position.side} position: P&L $${realizedPnl.toFixed(2)} (fees: $${totalFees.toFixed(2)}) (Capital: $${run.current_capital.toFixed(2)})`);
      } else {
        console.log(`     ⚠️  Could not retrieve closed position for P&L calculation`);
      }
    }
  }

  private async processSymbolEntrySignals(run: FakeTradeRun, symbol: string, candle: Candle, strategy: any) {
    const positions = await getOpenPositionsV2(run.run_id);
    const symbolPositions = positions.filter(p => p.symbol === symbol);
    
    const strategyState = {
      runId: run.run_id,
      symbol: symbol,
      currentCapital: run.current_capital,
      positions: symbolPositions.map(p => ({
        symbol: p.symbol,
        side: p.side,
        size: p.quantity_open,
        status: p.status === 'OPEN' ? 'open' : 'closed',
        entry_price: p.entry_price_vwap || 0,
        stop_loss: p.stop_loss,
        take_profit: p.take_profit,
      })),
      timeframe: run.timeframe
    };
    
    const signals = strategy(candle, strategyState, run.params);
    
    for (const signal of signals) {
      if (run.status === 'winding_down' && (signal.side === 'LONG' || signal.side === 'SHORT')) {
        console.log(`     🚫 Skipping entry signal for ${signal.symbol} - run is winding down`);
        await logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: 'winding_down',
          signal_ts: new Date().toISOString()
        });
        continue;
      }
      
      const existingPosition = symbolPositions.find(p => p.status === 'OPEN');
      const isExitSignal = existingPosition && 
        ((existingPosition.side === 'LONG' && signal.side === 'SHORT') ||
         (existingPosition.side === 'SHORT' && signal.side === 'LONG'));
      
      if (isExitSignal) {
        console.log(`     🚪 Exit Signal: Closing ${existingPosition.side} position for ${signal.symbol} (reason: ${signal.reason})`);
        
        const exitPrice = candle.close;
        
        // Create EXIT order
        const exitOrderId = await createOrder({
          run_id: run.run_id,
          symbol: signal.symbol,
          ts: new Date().toISOString(),
          side: existingPosition.side,
          type: 'EXIT',
          qty: existingPosition.quantity_open,
          price: exitPrice,
          status: 'NEW',
          reason_tag: signal.reason || 'strategy_exit',
          position_id: existingPosition.position_id,
        });
        
        // Link order to position
        await linkOrderToPosition(exitOrderId, existingPosition.position_id);
        
        // Create EXIT fill
        const fees = existingPosition.quantity_open * exitPrice * 0.0004;
        await createFill({
          order_id: exitOrderId,
          run_id: run.run_id,
          symbol: signal.symbol,
          ts: new Date().toISOString(),
          qty: existingPosition.quantity_open,
          price: exitPrice,
          fee: fees,
          position_id: existingPosition.position_id,
        });
        
        // Update position from fills
        await updatePositionFromFills(existingPosition.position_id);
        
        // Close position
        await closePositionV2(existingPosition.position_id, new Date().toISOString());
        
        // Get updated position for P&L calculation (position is now closed)
        const updatedPosition = await getPositionV2(existingPosition.position_id);
        
        if (updatedPosition) {
          const fills = await getFillsForPosition(existingPosition.position_id);
          const totalFees = fills.reduce((sum, fill) => sum + Number(fill.fee), 0);
          const realizedPnl = updatedPosition.realized_pnl;
          
          const newCapital = run.current_capital + existingPosition.cost_basis + realizedPnl - totalFees;
          await updateRunCapital(run.run_id, newCapital);
          run.current_capital = newCapital;
          
          console.log(`     ✅ Closed ${existingPosition.side} position: P&L $${realizedPnl.toFixed(2)} (fees: $${totalFees.toFixed(2)}) (Capital: $${run.current_capital.toFixed(2)})`);
        } else {
          console.log(`     ⚠️  Could not retrieve closed position for P&L calculation`);
        }
        
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
          execution_notes: `Exit signal executed: ${signal.reason}`,
          signal_ts: new Date().toISOString()
        });
        
      } else if (signal.side === 'LONG' || signal.side === 'SHORT') {
        await this.executeEntrySignal(run, signal, candle);
      }
    }
  }

  private async executeEntrySignal(run: FakeTradeRun, signal: any, candle: Candle) {
    console.log(`     🎯 Entry Signal (V2): ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${candle.close} (${signal.reason})`);
    
    try {
      // Prevent SHORT positions
      if (signal.side === 'SHORT') {
        console.log(`     🚫 SHORT positions are disabled - skipping signal`);
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
        return;
      }
      
      // Check position limits
      const currentPositions = await getOpenPositionsV2(run.run_id);
      if (currentPositions.length >= run.max_concurrent_positions) {
        console.log(`     🚫 Position limit reached: ${currentPositions.length}/${run.max_concurrent_positions} - skipping signal`);
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
        return;
      }
      
      const executionPrice = candle.close;
      const positionValue = signal.size * executionPrice;
      const marginRequired = positionValue / (signal.leverage || 1);
      const fees = signal.size * executionPrice * 0.0004;
      
      if (run.current_capital < (marginRequired + fees)) {
        console.log(`     💸 Insufficient capital: need $${(marginRequired + fees).toFixed(2)}, have $${run.current_capital.toFixed(2)} - skipping signal`);
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
        return;
      }
      
      // Update run capital
      const newCapital = run.current_capital - marginRequired - fees;
      await updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital;
      
      // Create position using canonical model
      const positionId = await createPositionV2({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        status: 'NEW',
        open_ts: new Date().toISOString(),
        quantity_open: signal.size,
        quantity_close: 0,
        cost_basis: marginRequired,
        fees_total: 0, // Will be updated by fills
        realized_pnl: 0,
        leverage_effective: signal.leverage || 1,
        stop_loss: signal.stopLoss || undefined,
        take_profit: signal.takeProfit || undefined,
      });
      
      // Create entry order
      const orderId = await createOrder({
        run_id: run.run_id,
        symbol: signal.symbol,
        ts: new Date().toISOString(),
        side: signal.side,
        type: 'ENTRY',
        qty: signal.size,
        price: executionPrice,
        status: 'NEW',
        reason_tag: signal.reason,
        position_id: positionId,
      });
      
      // Link order to position
      await linkOrderToPosition(orderId, positionId);
      
      // Create fill (immediate execution for market orders)
      const fillId = await createFill({
        order_id: orderId,
        run_id: run.run_id,
        symbol: signal.symbol,
        ts: new Date().toISOString(),
        qty: signal.size,
        price: executionPrice,
        fee: fees,
        position_id: positionId,
      });
      
      // Update position from fills
      await updatePositionFromFills(positionId);
      
      console.log(`     ✅ Position opened: ${signal.symbol} ${signal.side} ${signal.size.toFixed(4)} @ $${executionPrice.toFixed(2)}`);
      console.log(`     💰 Capital updated: $${run.current_capital.toFixed(2)}`);
      
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
      console.error(`     ❌ Signal execution failed:`, error.message);
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
}

// Start the fake trader
const trader = new FakeTrader();
trader.start().catch(error => {
  console.error('💥 Failed to start fake trader:', error);
  process.exit(1);
});


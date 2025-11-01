import cron from 'node-cron';
import type {
  TradeRun,
  Position,
  Trade,
  Candle,
  TradeSignal,
  StrategyState,
  TradingEngineConfig,
  DatabaseOperations
} from '../types.js';
import { getStrategy } from './strategies.js';

export abstract class TradingEngine {
  protected running = false;
  protected config: TradingEngineConfig;
  protected db: DatabaseOperations;

  constructor(config: TradingEngineConfig, db: DatabaseOperations) {
    this.config = config;
    this.db = db;
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ${this.config.isRealTrading ? 'Real' : 'Fake'} Trader...`);

    // Test database connection
    await this.db.testConnection();

    // Additional startup checks for real trading
    if (this.config.isRealTrading) {
      await this.performRealTradingStartupChecks();
    }

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

    console.log('⏰ Trading engine scheduled to run every 1 minute');
    console.log('📊 Watching for active trading runs...');

    // Run initial cycle
    await this.executeTradingCycle();
  }

  protected abstract performRealTradingStartupChecks(): Promise<void>;

  private async handleDowntimeRecovery(): Promise<void> {
    console.log('🔍 Checking for downtime recovery...');

    try {
      // Get active runs and check their last update times
      const activeRuns = await this.db.getActiveRuns();
      const now = new Date();

      for (const run of activeRuns) {
        const lastUpdate = new Date(run.last_update || now.toISOString());
        const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

        // If last update was more than 5 minutes ago, we missed at least some cycles
        if (minutesSinceUpdate > 5) {
          console.log(`⚠️  Run ${run.run_id} missed ${Math.floor(minutesSinceUpdate)} cycles during downtime`);

          // Sync positions with external source (Binance for real trading, database for fake)
          await this.syncPositionsAfterDowntime(run);

          // Log the recovery event
          await this.db.logSignal({
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

  protected abstract syncPositionsAfterDowntime(run: TradeRun): Promise<void>;

  private async executeTradingCycle(): Promise<void> {
    console.log(`\n🔄 [${new Date().toISOString()}] Executing trading cycle...`);

    // Get all active trading runs
    const activeRuns = await this.db.getActiveRuns();

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
        await this.db.updateRunStatus(run.run_id, 'error', error.message);
      }
    }

    console.log('✅ Trading cycle completed');
  }

  private async processRun(run: TradeRun): Promise<void> {
    console.log(`\n🎯 Processing run: ${run.name || run.run_id}`);
    console.log(`   Strategy: ${run.strategy_name}`);
    console.log(`   Symbols: ${run.symbols.join(', ')}`);
    console.log(`   Capital: $${run.current_capital}`);

    if (this.config.isRealTrading) {
      console.log(`   Mode: ${run.testnet ? 'TESTNET' : 'MAINNET'}`);
    }

    // Bankruptcy protection - stop runs with negative capital
    if (run.current_capital < 0) {
      console.log(`   💸 BANKRUPTCY: Capital is negative ($${run.current_capital.toFixed(2)}) - stopping run`);
      await this.db.updateRunStatus(run.run_id, 'stopped', `Bankruptcy protection: Capital went negative ($${run.current_capital.toFixed(2)})`);
      return;
    }

    // Safety check - if run has way too many positions, stop it immediately
    const currentPositions = await this.db.getCurrentPositions(run.run_id);
    if (currentPositions.length > run.max_concurrent_positions * 2) {
      console.log(`   🚨 SAFETY: Too many positions (${currentPositions.length} vs limit ${run.max_concurrent_positions}) - stopping run and closing positions`);

      // Stop the run
      await this.db.updateRunStatus(run.run_id, 'stopped', `Safety stop: Too many open positions (${currentPositions.length} vs limit ${run.max_concurrent_positions})`);

      // Force close all positions
      await this.forceCloseAllPositions(run, currentPositions);
      return;
    }

    // Risk management checks (real trading only)
    if (this.config.isRealTrading) {
      const riskCheckPassed = await this.checkRiskLimits(run);
      if (!riskCheckPassed) {
        console.log(`   ⚠️  Risk limits exceeded, skipping run`);
        return;
      }
    }

    // Get live prices for position management
    const livePrices = await this.db.getLivePrices(run.symbols);

    // Update existing positions with current prices
    await this.updateExistingPositions(run, livePrices);

    // Get recent candles at the configured timeframe
    console.log(`   📊 Evaluating entry signals using recent ${run.timeframe} candles`);

    // Get recent candles for all symbols (look back enough to have historical context)
    const lookbackMinutes = 300; // Look back 5 hours for enough historical context
    const recentCandles = await this.db.getRecentCandles(run.symbols, lookbackMinutes, run.timeframe);

    // Get strategy function
    const strategy = getStrategy(run.strategy_name);

    // Process each symbol's recent candles for entry signals
    for (const symbol of run.symbols) {
      const candles = recentCandles[symbol] || [];
      if (candles.length === 0) {
        console.log(`⏭️  Skipping ${symbol} - no recent candle data`);
        continue;
      }

      console.log(`   📊 Processing ${candles.length} recent candles for ${symbol}`);

      // Process candles like the backtest does - check if we haven't processed this candle before
      const lastProcessedCandle = await this.db.getLastProcessedCandle(run.run_id, symbol);

      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // Skip candles we've already processed
        if (lastProcessedCandle && new Date(candle.ts) <= new Date(lastProcessedCandle)) {
          continue;
        }

        // Process this candle for entry signals
        await this.processSymbolEntrySignals(run, symbol, candle, strategy);

        // Mark this candle as processed
        await this.db.updateLastProcessedCandle(run.run_id, symbol, candle.ts);

        // Only process one new candle per symbol per cycle to avoid spam
        break;
      }
    }

    // Update run's last update timestamp and check if winding down run should be stopped
    if (run.status === 'winding_down') {
      // Get current positions to check if all are closed
      const allPositions = await this.db.getCurrentPositions(run.run_id);
      const openPositionsCount = allPositions.filter(p => p.status === 'open').length;

      if (openPositionsCount === 0) {
        console.log(`✅ All positions closed for winding down run ${run.run_id}, stopping run`);
        await this.db.updateRunStatus(run.run_id, 'stopped', 'All positions closed during wind down');
      } else {
        console.log(`🔄 Winding down run ${run.run_id} has ${openPositionsCount} open positions remaining`);
        await this.db.updateRunStatus(run.run_id, 'winding_down');
      }
    } else {
      await this.db.updateRunStatus(run.run_id, 'active');
    }
  }

  protected abstract forceCloseAllPositions(run: TradeRun, positions: Position[]): Promise<void>;
  protected abstract checkRiskLimits(run: TradeRun): Promise<boolean>;

  private async updateExistingPositions(run: TradeRun, livePrices: Record<string, number>): Promise<void> {
    const positions = await this.db.getCurrentPositions(run.run_id);

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
      await this.db.updatePosition(position.position_id, livePrice, unrealizedPnl, marketValue);
      updatedCount++;

      if (verboseLogging) {
        const prevPrice = position.current_price ?? position.entry_price;
        console.log(`   📊 Updated ${position.symbol}: $${prevPrice?.toFixed(2) ?? 'N/A'} → $${livePrice.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
      }

      // Check for stop loss / take profit triggers using live prices
      await this.checkExitConditions(run, position, livePrice);
    }

    if (!verboseLogging) {
      console.log(`   ✅ Updated ${updatedCount} positions (logging reduced due to high position count)`);
    }

    // Update run capital to include real-time unrealized P&L
    await this.updateRunCapitalWithUnrealizedPnl(run);
  }

  private async updateRunCapitalWithUnrealizedPnl(run: TradeRun): Promise<void> {
    // Get all positions and trades to calculate total P&L
    const positions = await this.db.getCurrentPositions(run.run_id);
    const trades = await this.db.getTrades(run.run_id);

    const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + Number(pos.unrealized_pnl), 0);
    const totalRealizedPnl = trades.filter(t => t.status === 'closed').reduce((sum, trade) => sum + Number(trade.realized_pnl), 0);

    // Get total fees paid for all trades (both open and closed)
    const totalFeesPaid = trades.reduce((sum, trade) => sum + Number(trade.fees), 0);

    // Get total margin currently invested in open positions
    const totalMarginInvested = positions.reduce((sum, pos) => sum + Number(pos.cost_basis), 0);

    // Real-time capital = starting capital - total fees paid + realized P&L + unrealized P&L
    const realTimeCapital = Number(run.starting_capital) - totalFeesPaid + totalRealizedPnl + totalUnrealizedPnl;

    // Update the run's current capital
    await this.db.updateRunCapital(run.run_id, realTimeCapital);
    run.current_capital = realTimeCapital; // Update local copy
  }

  protected async checkExitConditions(run: TradeRun, position: Position, currentPrice: number): Promise<void> {
    let shouldExit = false;
    let exitReason = '';

    // Check time-based exit (close positions older than 24 hours)
    const hoursOpen = (new Date().getTime() - new Date(position.opened_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 24) {
      shouldExit = true;
      exitReason = 'time_based_exit';
    }

    // Check liquidation for highly leveraged positions (emergency exit)
    const unrealizedPnlPct = position.unrealized_pnl / position.cost_basis;
    if (position.leverage >= 10) {
      // For 10x+ leverage, liquidate if losses exceed 20% of cost basis
      if (unrealizedPnlPct <= -0.20) {
        shouldExit = true;
        exitReason = 'liquidation_high_leverage_loss';
      }
    } else if (position.leverage >= 5) {
      // For 5x+ leverage, liquidate if losses exceed 30% of cost basis
      if (unrealizedPnlPct <= -0.30) {
        shouldExit = true;
        exitReason = 'liquidation_medium_leverage_loss';
      }
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

      await this.executeExitSignal(run, position, currentPrice, exitReason);
    }
  }

  protected abstract executeExitSignal(run: TradeRun, position: Position, exitPrice: number, exitReason: string): Promise<void>;

  private async processSymbolEntrySignals(
    run: TradeRun,
    symbol: string,
    candle: Candle,
    strategy: (candle: Candle, state: StrategyState, params: any) => TradeSignal[]
  ): Promise<void> {
    console.log(`\n  📊 Evaluating entry signals for ${symbol} @ $${candle.close} (${run.timeframe} candle: ${candle.ts})`);

    // Get current positions for this symbol
    const positions = await this.db.getCurrentPositions(run.run_id);
    const symbolPositions = positions.filter(p => p.symbol === symbol);

    // Prepare strategy state
    const strategyState: StrategyState = {
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
        await this.db.logSignal({
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
      await this.db.logSignal({
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

  protected abstract executeEntrySignal(run: TradeRun, signal: TradeSignal, candle: Candle): Promise<void>;

  protected calculateUnrealizedPnL(position: Position, currentPrice: number): number {
    if (position.side === 'LONG') {
      return (currentPrice - position.entry_price) * position.size;
    } else {
      return (position.entry_price - currentPrice) * position.size;
    }
  }

  protected calculateRealizedPnL(position: Position, exitPrice: number): number {
    if (position.side === 'LONG') {
      return (exitPrice - position.entry_price) * position.size;
    } else {
      return (position.entry_price - exitPrice) * position.size;
    }
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down trading engine...');
    this.running = false;
    console.log('👋 Trading engine shutdown complete');
  }
}

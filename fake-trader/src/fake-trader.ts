import { TradingEngine } from '../../shared/dist/index.js';
import type { TradeRun, Position, TradeSignal, Candle } from '../../shared/dist/index.js';
import { databaseOperations } from '../../shared/dist/index.js';

export class FakeTrader extends TradingEngine {
  constructor() {
    super(
      { isRealTrading: false },
      databaseOperations
    );
  }

  protected async performRealTradingStartupChecks(): Promise<void> {
    // No additional checks needed for fake trading
  }

  protected async syncPositionsAfterDowntime(run: TradeRun): Promise<void> {
    try {
      console.log(`🔄 Refreshing stale positions for run ${run.run_id}`);

      // Get current positions for this run
      const positions = await this.db.getCurrentPositions(run.run_id);

      if (positions.length === 0) {
        return;
      }

      // Get current market data for position symbols
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const candles = await this.db.getCurrentCandles(symbols);

      // Update each position with current market price
      for (const position of positions) {
        const candle = candles[position.symbol];
        if (!candle) {
          console.log(`⚠️  No current data for ${position.symbol}, keeping stale price`);
          continue;
        }

        const unrealizedPnl = this.calculateUnrealizedPnL(position, candle.close);
        const marketValue = position.size * candle.close;

        await this.db.updatePosition(position.position_id, candle.close, unrealizedPnl, marketValue);

        console.log(`   📊 Updated ${position.symbol}: ${position.current_price} → ${candle.close} (P&L: ${unrealizedPnl.toFixed(2)})`);
      }

      console.log(`✅ Updated ${positions.length} stale positions for run ${run.run_id}`);

    } catch (error) {
      console.error(`❌ Failed to refresh positions for run ${run.run_id}:`, error);
    }
  }

  protected async forceCloseAllPositions(run: TradeRun, positions: Position[]): Promise<void> {
    // For fake trader, just mark positions as closed in database
    for (const position of positions) {
      try {
        // Get current price
        const livePrices = await this.db.getLivePrices([position.symbol]);
        const currentPrice = livePrices[position.symbol];

        if (currentPrice) {
          const realizedPnl = this.calculateRealizedPnL(position, currentPrice);
          await this.db.closePosition(position.position_id, currentPrice, realizedPnl);
          console.log(`   🔄 Force closed position ${position.symbol}`);
        }
      } catch (error) {
        console.error(`   ❌ Failed to close position ${position.symbol}:`, error);
      }
    }

    // Update database to mark positions as closed
    await this.db.pool.query(`UPDATE ft_positions SET status = 'closed' WHERE run_id = $1 AND status = 'open'`, [run.run_id]);
  }

  protected async checkRiskLimits(run: TradeRun): Promise<boolean> {
    // Fake trader doesn't need risk limit checks
    return true;
  }

  protected async executeExitSignal(run: TradeRun, position: Position, exitPrice: number, exitReason: string): Promise<void> {
    try {
      const realizedPnl = this.calculateRealizedPnL(position, exitPrice);
      const fees = position.size * exitPrice * 0.0004; // 0.04% fees

      await this.db.closePosition(position.position_id, exitPrice, realizedPnl);

      // Update run capital - add back margin + realized P&L - fees
      // For leverage: margin was deducted on open, add it back + P&L on leveraged position
      const newCapital = run.current_capital + position.cost_basis + realizedPnl - fees;
      await this.db.updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy

      console.log(`   ✅ Closed ${position.symbol} position: P&L $${realizedPnl.toFixed(2)} (fees: $${fees.toFixed(2)}) (Capital: $${run.current_capital.toFixed(2)})`);

      // Log successful exit
      await this.db.logSignal({
        run_id: run.run_id,
        symbol: position.symbol,
        signal_type: 'exit',
        side: position.side,
        size: position.size,
        executed: true,
        execution_price: exitPrice,
        execution_notes: `${exitReason} executed`,
        signal_ts: new Date().toISOString()
      });

    } catch (error: any) {
      console.error(`   ❌ Failed to execute exit for ${position.symbol}:`, error.message);

      // Log failed exit
      await this.db.logSignal({
        run_id: run.run_id,
        symbol: position.symbol,
        signal_type: 'exit',
        side: position.side,
        size: position.size,
        executed: false,
        execution_notes: `Exit failed: ${error.message}`,
        signal_ts: new Date().toISOString()
      });
    }
  }

  protected async executeEntrySignal(run: TradeRun, signal: TradeSignal, candle: Candle): Promise<void> {
    console.log(`     🎯 Entry Signal: ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${candle.close} (${signal.reason})`);

    try {
      // Check if a trade already exists for this exact signal (prevent duplicates)
      const existingTrades = await this.db.pool.query(`
        SELECT trade_id FROM ft_trades
        WHERE run_id = $1 AND symbol = $2 AND side = $3 AND entry_ts = $4
      `, [run.run_id, signal.symbol, signal.side, new Date().toISOString()]);

      if (existingTrades.rows.length > 0) {
        console.log(`     🚫 Duplicate signal detected - trade already exists for ${signal.symbol} ${signal.side} at this timestamp`);

        // Log the rejected signal
        await this.db.logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          rejection_reason: 'duplicate_signal_already_processed',
          signal_ts: new Date().toISOString()
        });

        return; // Exit early - don't create duplicate trade
      }

      // Check position limits BEFORE executing
      const currentPositions = await this.db.getCurrentPositions(run.run_id);
      if (currentPositions.length >= run.max_concurrent_positions) {
        console.log(`     🚫 Position limit reached: ${currentPositions.length}/${run.max_concurrent_positions} - skipping signal`);

        // Log the rejected signal
        await this.db.logSignal({
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
        await this.db.logSignal({
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
      await this.db.updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy

      // Create new trade and position
      const tradeId = await this.db.createTrade({
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

      await this.db.createPosition({
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
        status: 'open',
        opened_at: new Date().toISOString()
      });

      console.log(`     ✅ Opened ${signal.side} position: ${tradeId.substring(0, 8)}... (Capital: $${run.current_capital.toFixed(2)})`);

      // Log successful signal execution
      await this.db.logSignal({
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
      await this.db.logSignal({
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

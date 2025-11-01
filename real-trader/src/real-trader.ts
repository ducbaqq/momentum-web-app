import { TradingEngine, databaseOperations, getStrategy } from '../../shared/dist/index.js';
import { BinanceClient } from './binanceClient.js';
import type { TradeRun, Position, TradeSignal, Candle } from '../../shared/dist/index.js';
import { PositionSide, OrderSide } from '../../shared/dist/index.js';

export class RealTrader extends TradingEngine {
  private binanceClient: BinanceClient;
  private availableBalance: number = 0;

  constructor(binanceConfig: any) {
    super(
      { isRealTrading: true, binanceConfig },
      databaseOperations
    );
    this.binanceClient = new BinanceClient(binanceConfig);
  }

  protected async performRealTradingStartupChecks(): Promise<void> {
    console.log('🔗 Connecting to Binance API...');

    const binanceConnected = await this.binanceClient.testConnection();
    if (!binanceConnected) {
      throw new Error('Failed to connect to Binance API');
    }

    // Verify account info and balance
    await this.verifyAccountSetup();
  }

  private async verifyAccountSetup(): Promise<void> {
    try {
      const accountInfo = await this.binanceClient.getAccountInfo();
      console.log(`💰 Account Balance: $${parseFloat(accountInfo.totalWalletBalance).toFixed(2)}`);
      console.log(`💵 Available Balance: $${parseFloat(accountInfo.availableBalance).toFixed(2)}`);

      // Store available balance for capital management
      this.availableBalance = parseFloat(accountInfo.availableBalance);

      // Check for existing positions
      const positions = await this.binanceClient.getPositions();
      if (positions.length > 0) {
        console.log(`📍 Found ${positions.length} existing Binance positions:`);
        for (const pos of positions) {
          console.log(`   ${pos.symbol}: ${pos.positionSide} ${pos.positionAmt} @ $${parseFloat(pos.entryPrice).toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to verify account setup:', error);
      throw error;
    }
  }

  protected async syncPositionsAfterDowntime(run: TradeRun): Promise<void> {
    try {
      console.log(`🔄 Syncing positions with Binance for run ${run.run_id}`);

      // Get current positions from database
      const dbPositions = await this.db.getCurrentPositions(run.run_id);

      // Get current positions from Binance
      const binancePositions = await this.binanceClient.getPositions();

      // Sync each symbol
      for (const symbol of run.symbols) {
        const dbPos = dbPositions.find(p => p.symbol === symbol);
        const binancePos = binancePositions.find(p => p.symbol === symbol);

        if (dbPos && !binancePos) {
          // Position exists in DB but not in Binance - mark as closed
          console.log(`   📍 Closing stale DB position for ${symbol}`);
          const prices = await this.db.getLivePrices([symbol]);
          const currentPrice = prices[symbol];
          const realizedPnl = this.calculateRealizedPnL(dbPos, currentPrice);
          await this.db.closePosition(dbPos.position_id, currentPrice, realizedPnl);
        } else if (!dbPos && binancePos && parseFloat(binancePos.positionAmt) !== 0) {
          // Position exists in Binance but not in DB - create DB record
          console.log(`   📍 Creating DB record for Binance position ${symbol}`);
          // This is a complex case - we'll log it for manual review
          await this.db.logSignal({
            run_id: run.run_id,
            symbol: symbol,
            signal_type: 'adjustment',
            rejection_reason: 'Binance position found without DB record - manual review required',
            executed: false,
            signal_ts: new Date().toISOString()
          });
        } else if (dbPos && binancePos) {
          // Position exists in both - update prices
          const currentPrice = parseFloat(binancePos.markPrice);
          const unrealizedPnl = parseFloat(binancePos.unRealizedProfit);
          const marketValue = Math.abs(parseFloat(binancePos.positionAmt)) * currentPrice;
          await this.db.updatePosition(dbPos.position_id, currentPrice, unrealizedPnl, marketValue);

          console.log(`   📊 Synced ${symbol}: $${dbPos.current_price} → $${currentPrice.toFixed(2)} (P&L: ${unrealizedPnl.toFixed(2)})`);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to sync positions for run ${run.run_id}:`, error);
    }
  }

  protected async forceCloseAllPositions(run: TradeRun, positions: Position[]): Promise<void> {
    // For real trader, close positions via Binance API
    for (const position of positions) {
      try {
        const exitSide = position.side === PositionSide.LONG ? OrderSide.SELL : OrderSide.BUY;
        await this.binanceClient.placeFuturesMarketOrder(
          position.symbol,
          exitSide,
          Math.abs(position.size)
        );
        console.log(`   🔄 Force closed position ${position.symbol} via Binance`);
      } catch (error) {
        console.error(`   ❌ Failed to close position ${position.symbol}:`, error);
      }
    }
  }

  protected async checkRiskLimits(run: TradeRun): Promise<boolean> {
    try {
      // Check daily loss limit
      const todaysPnL = await this.db.getTodaysPnL(run.run_id);
      const dailyLossPct = (todaysPnL / run.starting_capital!) * 100;

      if (dailyLossPct < -run.daily_loss_limit_pct!) {
        await this.db.updateRunStatus(run.run_id, 'paused', `Daily loss limit exceeded: ${dailyLossPct.toFixed(2)}%`);
        return false;
      }

      // Check max drawdown limit
      const maxDrawdown = await this.db.getMaxDrawdown(run.run_id);
      if (maxDrawdown > run.max_drawdown_pct!) {
        await this.db.updateRunStatus(run.run_id, 'paused', `Max drawdown exceeded: ${maxDrawdown.toFixed(2)}%`);
        return false;
      }

      // Check available balance on Binance (update stored balance)
      this.availableBalance = await this.binanceClient.getAvailableBalance();
      if (this.availableBalance < 100) { // Minimum $100 balance
        await this.db.updateRunStatus(run.run_id, 'paused', `Insufficient balance: $${this.availableBalance.toFixed(2)}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Failed to check risk limits for run ${run.run_id}:`, error);
      return false;
    }
  }

  protected async executeExitSignal(run: TradeRun, position: Position, exitPrice: number, exitReason: string): Promise<void> {
    try {
      // Place exit order on Binance
      const exitSide = position.side === PositionSide.LONG ? OrderSide.SELL : OrderSide.BUY;
      const orderResponse = await this.binanceClient.placeFuturesMarketOrder(
        position.symbol,
        exitSide,
        Math.abs(position.size),
        {
          positionSide: position.side
        }
      );

      const realizedPnl = this.calculateRealizedPnL(position, exitPrice);
      const fees = orderResponse.fills.reduce((sum: number, fill: any) => sum + parseFloat(fill.commission), 0);

      await this.db.closePosition(position.position_id, exitPrice, realizedPnl);

      // Update run capital
      const newCapital = run.current_capital + realizedPnl - fees;
      await this.db.updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy

      console.log(`   ✅ Closed ${position.symbol} position: P&L $${realizedPnl.toFixed(2)} (fees: $${fees.toFixed(2)})`);

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
        binance_order_id: Number(orderResponse.orderId),
        binance_response: orderResponse,
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
      // Check position limits BEFORE executing
      const currentPositions = await this.db.getCurrentPositions(run.run_id);
      if (currentPositions.length >= run.max_concurrent_positions!) {
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

      // Check position size limits
      const positionValueUsd = signal.size * candle.close;
      if (positionValueUsd > run.max_position_size_usd!) {
        const adjustedSize = run.max_position_size_usd! / candle.close;
        console.log(`     📏 Position size adjusted: ${signal.size.toFixed(4)} → ${adjustedSize.toFixed(4)} (max position size limit)`);
        signal.size = adjustedSize;
      }

      // Check capital sufficiency using real Binance balance
      const marginRequired = (signal.size * candle.close) / (signal.leverage || 1);
      const estimatedFees = signal.size * candle.close * 0.0004; // 0.04% est. fee
      if (this.availableBalance < (marginRequired + estimatedFees)) {
        console.log(`     💸 Insufficient balance: need ~$${(marginRequired + estimatedFees).toFixed(2)}, have $${this.availableBalance.toFixed(2)} - skipping signal`);

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
          rejection_reason: `insufficient_balance_need_${(marginRequired + estimatedFees).toFixed(2)}_have_${this.availableBalance.toFixed(2)}`,
          signal_ts: new Date().toISOString()
        });

        return; // Exit early - don't execute the signal
      }

      // Get minimum order size and format quantity
      const { minQty } = await this.binanceClient.getMinOrderSize(signal.symbol);
      const formattedSizeStr = this.binanceClient.formatQuantity(signal.symbol, signal.size);
      const formattedSize = parseFloat(formattedSizeStr);

      if (formattedSize < minQty) {
        console.log(`     📏 Position size too small: ${formattedSize} < ${minQty}, skipping`);

        await this.db.logSignal({
          run_id: run.run_id,
          symbol: signal.symbol,
          signal_type: 'entry',
          side: signal.side,
          size: signal.size,
          price: signal.price,
          candle_data: candle,
          executed: false,
          execution_notes: `Position size below minimum: ${formattedSize.toString()} < ${minQty.toString()}`,
          signal_ts: new Date().toISOString()
        });

        return;
      }

      // Place order on Binance
      const orderSide = signal.side === PositionSide.LONG ? OrderSide.BUY : OrderSide.SELL;
      const orderResponse = await this.binanceClient.placeFuturesMarketOrder(
        signal.symbol,
        orderSide,
        formattedSize,
        {
          leverage: signal.leverage || 1,
          marginType: 'cross',
          positionSide: signal.side
        }
      );

      const executionPrice = parseFloat(orderResponse.price) || candle.close;
      const executedQty = parseFloat(orderResponse.executedQty);
      const fees = orderResponse.fills.reduce((sum: number, fill: any) => sum + parseFloat(fill.commission), 0);

      // Create new trade and position records
      const tradeId = await this.db.createTrade({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        entry_ts: new Date().toISOString(),
        qty: executedQty,
        entry_px: executionPrice,
        realized_pnl: 0,
        unrealized_pnl: 0,
        fees: fees,
        binance_order_id: Number(orderResponse.orderId),
        binance_client_order_id: orderResponse.clientOrderId,
        reason: signal.reason,
        leverage: signal.leverage || 1,
        status: 'open'
      });

      await this.db.createPosition({
        run_id: run.run_id,
        symbol: signal.symbol,
        side: signal.side,
        size: signal.side === 'LONG' ? executedQty : -executedQty,
        entry_price: executionPrice,
        current_price: executionPrice,
        unrealized_pnl: 0,
        cost_basis: executedQty * executionPrice,
        market_value: executedQty * executionPrice,
        stop_loss: signal.stopLoss,
        take_profit: signal.takeProfit,
        leverage: signal.leverage || 1,
        binance_position_side: signal.side,
        binance_margin_type: 'cross',
        status: 'open',
        opened_at: new Date().toISOString()
      });

      // Update run capital - subtract fees (futures uses margin, not full position cost)
      const newCapital = run.current_capital - fees;
      await this.db.updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy

      // Update available balance
      this.availableBalance -= fees;

      console.log(`     ✅ Opened ${signal.side} position: ${tradeId.substring(0, 8)}... (Binance ID: ${orderResponse.orderId}) (Capital: $${run.current_capital.toFixed(2)})`);

      // Log successful signal execution
      await this.db.logSignal({
        run_id: run.run_id,
        symbol: signal.symbol,
        signal_type: 'entry',
        side: signal.side,
        size: executedQty,
        price: signal.price,
        candle_data: candle,
        executed: true,
        execution_price: executionPrice,
        execution_notes: `Executed ${signal.reason}`,
        binance_order_id: Number(orderResponse.orderId),
        binance_response: orderResponse,
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

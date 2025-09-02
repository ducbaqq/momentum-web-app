import dotenv from 'dotenv';
import cron from 'node-cron';
import { BinanceClient } from './binanceClient.js';
import { 
  testConnection, 
  getActiveRuns, 
  getCompleted15mCandles,
  getRecentCandles,
  getLivePrices,
  getCurrentPositions,
  createTrade,
  createPosition,
  updatePosition,
  closePosition,
  logSignal,
  updateRunStatus,
  updateRunCapital,
  getTodaysPnL,
  getMaxDrawdown,
  updateDailySummary
} from './db.js';
import { getStrategy } from './strategies.js';
import type { 
  RealTradeRun, 
  Candle, 
  RealPosition, 
  BinanceConfig,
  MarketStreamData,
  UserDataStreamData 
} from './types.js';
import { PositionSide, OrderSide, OrderType } from './types.js';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });
dotenv.config(); // Also load from current directory if exists

class RealTrader {
  private running = false;
  private binanceClient: BinanceClient;
  private websocketInitialized = false;
  private priceCache: Map<string, number> = new Map();
  private lastPriceUpdate = 0;

  constructor(binanceConfig: BinanceConfig) {
    this.binanceClient = new BinanceClient(binanceConfig);
  }

  async start() {
    console.log('🚀 Starting Real Trader...');
    console.log(`📊 Mode: ${this.binanceClient['config'].testnet ? 'TESTNET' : 'MAINNET'}`);
    
    // Test database and Binance connections
    await testConnection();
    const binanceConnected = await this.binanceClient.testConnection();
    
    if (!binanceConnected) {
      throw new Error('Failed to connect to Binance API');
    }
    
    // Verify account info
    await this.verifyAccountSetup();
    
    // Initialize WebSocket streams
    await this.initializeWebSocketStreams();
    
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
    
    console.log('⏰ Real Trader scheduled to run every 1 minute');
    console.log('📊 Watching for active trading runs...');
    
    // Run initial cycle
    await this.executeTradingCycle();
  }

  private async verifyAccountSetup() {
    try {
      const accountInfo = await this.binanceClient.getAccountInfo();
      console.log(`💰 Account Balance: $${parseFloat(accountInfo.totalWalletBalance).toFixed(2)}`);
      console.log(`💵 Available Balance: $${parseFloat(accountInfo.availableBalance).toFixed(2)}`);
      
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
          
          // Sync positions with Binance
          await this.syncPositionsWithBinance(run);
          
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

  private async syncPositionsWithBinance(run: RealTradeRun) {
    try {
      console.log(`🔄 Syncing positions with Binance for run ${run.run_id}`);
      
      // Get current positions from database
      const dbPositions = await getCurrentPositions(run.run_id);
      
      // Get current positions from Binance
      const binancePositions = await this.binanceClient.getPositions();
      
      // Sync each symbol
      for (const symbol of run.symbols) {
        const dbPos = dbPositions.find(p => p.symbol === symbol);
        const binancePos = binancePositions.find(p => p.symbol === symbol);
        
        if (dbPos && !binancePos) {
          // Position exists in DB but not in Binance - mark as closed
          console.log(`   📍 Closing stale DB position for ${symbol}`);
          const prices = await getLivePrices([symbol]);
          const currentPrice = prices[symbol];
          const realizedPnl = this.calculateRealizedPnL(dbPos, currentPrice);
          await closePosition(dbPos.position_id, currentPrice, realizedPnl);
        } else if (!dbPos && binancePos && parseFloat(binancePos.positionAmt) !== 0) {
          // Position exists in Binance but not in DB - create DB record
          console.log(`   📍 Creating DB record for Binance position ${symbol}`);
          // This is a complex case - we'll log it for manual review
          await logSignal({
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
          await updatePosition(dbPos.position_id, currentPrice, unrealizedPnl, marketValue);
          
          console.log(`   📊 Synced ${symbol}: $${dbPos.current_price} → $${currentPrice.toFixed(2)} (P&L: ${unrealizedPnl.toFixed(2)})`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to sync positions for run ${run.run_id}:`, error);
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

  private async processRun(run: RealTradeRun) {
    console.log(`\n🎯 Processing run: ${run.name || run.run_id}`);
    console.log(`   Strategy: ${run.strategy_name}`);
    console.log(`   Symbols: ${run.symbols.join(', ')}`);
    console.log(`   Capital: $${run.current_capital}`);
    console.log(`   Mode: ${run.testnet ? 'TESTNET' : 'MAINNET'}`);
    
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
      
      // Close all positions via Binance API  
      for (const position of currentPositions) {
        try {
          const exitSide = position.side === PositionSide.LONG ? OrderSide.SELL : OrderSide.BUY;
          await this.binanceClient.placeFuturesMarketOrder(
            position.symbol,
            exitSide,
            Math.abs(position.size)
          );
          console.log(`   🔄 Force closed position ${position.symbol}`);
        } catch (error) {
          console.error(`   ❌ Failed to close position ${position.symbol}:`, error);
        }
      }
      
      return;
    }
    
    // Risk management checks
    const riskCheckPassed = await this.checkRiskLimits(run);
    if (!riskCheckPassed) {
      console.log(`   ⚠️  Risk limits exceeded, skipping run`);
      return;
    }
    
    // Get live prices from database for position management
    const livePrices = await getLivePrices(run.symbols);
    
    // Update existing positions with current prices
    await this.updateExistingPositions(run, livePrices);
    
    // Get recent 1-minute candles like backtest does
    console.log(`   📊 Evaluating entry signals using recent 1-minute candles (matching backtest behavior)`);
    
    // Get recent 1-minute candles for all symbols (look back 60 minutes)
    const recentCandles = await getRecentCandles(run.symbols, 60);
    
    // Get strategy function
    const strategy = getStrategy(run.strategy_name);
    
    // Process each symbol's recent candles for entry signals
    for (const symbol of run.symbols) {
      const candles = recentCandles[symbol] || [];
      if (candles.length === 0) {
        console.log(`⏭️  Skipping ${symbol} - no recent candle data`);
        continue;
      }
      
      console.log(`   📊 Processing ${candles.length} recent 1-minute candles for ${symbol}`);
      
      // Process each candle like the backtest does
      for (let i = candles.length - 5; i < candles.length; i++) { // Only check last 5 candles to avoid spam
        if (i < 0) continue;
        
        const candle = candles[i];
        await this.processSymbolEntrySignals(run, symbol, candle, strategy);
        
        // Only process one candle at a time to avoid multiple simultaneous trades
        // In the next cycle, we'll process newer candles
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

  private async checkRiskLimits(run: RealTradeRun): Promise<boolean> {
    try {
      // Check daily loss limit
      const todaysPnL = await getTodaysPnL(run.run_id);
      const dailyLossPct = (todaysPnL / run.starting_capital) * 100;
      
      if (dailyLossPct < -run.daily_loss_limit_pct) {
        await updateRunStatus(run.run_id, 'paused', `Daily loss limit exceeded: ${dailyLossPct.toFixed(2)}%`);
        return false;
      }
      
      // Check max drawdown limit
      const maxDrawdown = await getMaxDrawdown(run.run_id);
      if (maxDrawdown > run.max_drawdown_pct) {
        await updateRunStatus(run.run_id, 'paused', `Max drawdown exceeded: ${maxDrawdown.toFixed(2)}%`);
        return false;
      }
      
      // Check available balance on Binance
      const availableBalance = await this.binanceClient.getAvailableBalance();
      if (availableBalance < 100) { // Minimum $100 balance
        await updateRunStatus(run.run_id, 'paused', `Insufficient balance: $${availableBalance.toFixed(2)}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to check risk limits for run ${run.run_id}:`, error);
      return false;
    }
  }

  private async updateExistingPositions(run: RealTradeRun, livePrices: Record<string, number>) {
    const positions = await getCurrentPositions(run.run_id);
    
    if (positions.length === 0) {
      return;
    }
    
    console.log(`   📍 Updating ${positions.length} open positions with ${this.websocketInitialized ? 'WebSocket' : 'REST'} prices`);
    
    // If there are too many positions, it indicates a problem - don't spam logs
    const verboseLogging = positions.length <= 10;
    let updatedCount = 0;
    
    for (const position of positions) {
      let livePrice = livePrices[position.symbol];
      
      // Try to get price from WebSocket cache first (more recent)
      if (this.websocketInitialized && this.priceCache.has(position.symbol)) {
        const cachedPrice = this.priceCache.get(position.symbol)!;
        const cacheAge = Date.now() - this.lastPriceUpdate;
        
        // Use cached price if it's recent (less than 30 seconds old)
        if (cacheAge < 30000) {
          livePrice = cachedPrice;
        }
      }
      
      if (!livePrice) {
        if (verboseLogging) {
          console.log(`   ⚠️  No live price for ${position.symbol}, keeping current price`);
        }
        continue;
      }
      
      const unrealizedPnl = this.calculateUnrealizedPnL(position, livePrice);
      const marketValue = Math.abs(position.size) * livePrice;
      await updatePosition(position.position_id, livePrice, unrealizedPnl, marketValue);
      updatedCount++;
      
      if (verboseLogging) {
        const prevPrice = position.current_price ?? position.entry_price;
        console.log(`   📊 Updated ${position.symbol}: $${prevPrice.toFixed(2)} → $${livePrice.toFixed(2)} (P&L: $${unrealizedPnl.toFixed(2)})`);
      }
      
      // Check for stop loss / take profit triggers using live prices
      await this.checkExitConditions(run, position, livePrice);
    }
    
    if (!verboseLogging) {
      console.log(`   ✅ Updated ${updatedCount} positions (logging reduced due to high position count)`);
    }
  }

  private async checkExitConditions(run: RealTradeRun, position: RealPosition, currentPrice: number) {
    let shouldExit = false;
    let exitReason = '';
    
    // Check time-based exit (close positions older than 24 hours)
    const hoursOpen = (new Date().getTime() - new Date(position.opened_at).getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 24) {
      shouldExit = true;
      exitReason = 'time_based_exit';
    }
    
    // Check stop loss
    if (position.stop_loss && 
        ((position.side === PositionSide.LONG && currentPrice <= position.stop_loss) ||
         (position.side === PositionSide.SHORT && currentPrice >= position.stop_loss))) {
      shouldExit = true;
      exitReason = 'stop_loss_trigger';
    }
    
    // Check take profit
    if (position.take_profit && 
        ((position.side === PositionSide.LONG && currentPrice >= position.take_profit) ||
         (position.side === PositionSide.SHORT && currentPrice <= position.take_profit))) {
      shouldExit = true;
      exitReason = 'take_profit_trigger';
    }
    
    if (shouldExit) {
      console.log(`   🎯 Exit triggered for ${position.symbol}: ${exitReason} at $${currentPrice.toFixed(2)}`);
      
      try {
        // Place exit order on Binance
        const exitSide = position.side === PositionSide.LONG ? OrderSide.SELL : OrderSide.BUY;
        const orderResponse = await this.binanceClient.placeFuturesMarketOrder(
          position.symbol,
          exitSide,
          Math.abs(position.size),
          {
            positionSide: position.binance_position_side || position.side
          }
        );
        
        const realizedPnl = this.calculateRealizedPnL(position, currentPrice);
        const fees = orderResponse.fills.reduce((sum, fill) => sum + parseFloat(fill.commission), 0);
        
        await closePosition(position.position_id, currentPrice, realizedPnl);
        
        // Update run capital
        const newCapital = run.current_capital + realizedPnl - fees;
        await updateRunCapital(run.run_id, newCapital);
        run.current_capital = newCapital; // Update local copy
        
        console.log(`   ✅ Closed ${position.symbol} position: P&L $${realizedPnl.toFixed(2)} (fees: $${fees.toFixed(2)})`);
        
        // Log successful exit
        await logSignal({
          run_id: run.run_id,
          symbol: position.symbol,
          signal_type: 'exit',
          side: position.side,
          size: position.size,
          executed: true,
          execution_price: currentPrice,
          execution_notes: `${exitReason} executed`,
          binance_order_id: Number(orderResponse.orderId),
          binance_response: orderResponse,
          signal_ts: new Date().toISOString()
        });
        
      } catch (error: any) {
        console.error(`   ❌ Failed to execute exit for ${position.symbol}:`, error.message);
        
        // Log failed exit
        await logSignal({
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
  }

  private async processSymbolEntrySignals(
    run: RealTradeRun, 
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
      if (signal.side === PositionSide.LONG || signal.side === PositionSide.SHORT) {
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

  private async executeEntrySignal(run: RealTradeRun, signal: any, candle: Candle) {
    console.log(`     🎯 Entry Signal: ${signal.side} ${signal.size.toFixed(4)} ${signal.symbol} @ $${candle.close} (${signal.reason})`);
    
    try {
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
      
      // Check position size limits
      const positionValueUsd = signal.size * candle.close;
      if (positionValueUsd > run.max_position_size_usd) {
        const adjustedSize = run.max_position_size_usd / candle.close;
        console.log(`     📏 Position size adjusted: ${signal.size.toFixed(4)} → ${adjustedSize.toFixed(4)} (max position size limit)`);
        signal.size = adjustedSize;
      }
      
      // Check capital sufficiency (estimate minimum margin requirement)
      const marginRequired = (signal.size * candle.close) / (signal.leverage || 1);
      const estimatedFees = signal.size * candle.close * 0.0004; // 0.04% est. fee
      if (run.current_capital < (marginRequired + estimatedFees)) {
        console.log(`     💸 Insufficient capital: need ~$${(marginRequired + estimatedFees).toFixed(2)}, have $${run.current_capital.toFixed(2)} - skipping signal`);
        
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
          rejection_reason: `insufficient_capital_need_${(marginRequired + estimatedFees).toFixed(2)}_have_${run.current_capital.toFixed(2)}`,
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
        
        await logSignal({
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
      const tradeId = await createTrade({
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
      
      await createPosition({
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
        status: 'open'
      });
      
      // Update run capital - subtract fees (futures uses margin, not full position cost)
      const newCapital = run.current_capital - fees;
      await updateRunCapital(run.run_id, newCapital);
      run.current_capital = newCapital; // Update local copy
      
      console.log(`     ✅ Opened ${signal.side} position: ${tradeId.substring(0, 8)}... (Binance ID: ${orderResponse.orderId}) (Capital: $${run.current_capital.toFixed(2)})`);
      
      // Log successful signal execution
      await logSignal({
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

  private calculateUnrealizedPnL(position: RealPosition, currentPrice: number): number {
    if (position.side === PositionSide.LONG) {
      return (currentPrice - position.entry_price) * Math.abs(position.size);
    } else {
      return (position.entry_price - currentPrice) * Math.abs(position.size);
    }
  }

  private calculateRealizedPnL(position: RealPosition, exitPrice: number): number {
    if (position.side === PositionSide.LONG) {
      return (exitPrice - position.entry_price) * Math.abs(position.size);
    } else {
      return (position.entry_price - exitPrice) * Math.abs(position.size);
    }
  }

  // WebSocket stream initialization and management
  private async initializeWebSocketStreams(): Promise<void> {
    try {
      console.log('🌐 Initializing WebSocket streams...');
      
      // Get active runs to determine which symbols to stream
      const activeRuns = await getActiveRuns();
      const allSymbols = Array.from(new Set(
        activeRuns.flatMap(run => run.symbols)
      ));
      
      if (allSymbols.length === 0) {
        console.log('📭 No active runs found, skipping WebSocket initialization');
        return;
      }
      
      // Initialize market data streams for live prices
      await this.binanceClient.initializeMarketStreams(allSymbols, ['ticker', 'kline_1m']);
      
      // Initialize user data stream for account updates
      await this.binanceClient.initializeUserDataStream();
      
      // Set up event handlers
      this.setupWebSocketEventHandlers();
      
      this.websocketInitialized = true;
      console.log(`✅ WebSocket streams initialized for ${allSymbols.length} symbols`);
      
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket streams:', error);
      // Don't throw error - continue with REST API fallback
    }
  }

  private setupWebSocketEventHandlers(): void {
    const marketStreamManager = this.binanceClient.getMarketStreamManager();
    const userStreamManager = this.binanceClient.getUserStreamManager();
    
    if (marketStreamManager) {
      // Handle market data updates
      marketStreamManager.onMessage((data: any) => {
        this.handleMarketDataUpdate(data as MarketStreamData);
      });
      
      marketStreamManager.onError((error: Error) => {
        console.error('📡 Market stream error:', error.message);
      });
      
      marketStreamManager.onClose(() => {
        console.warn('📡 Market stream disconnected');
        this.websocketInitialized = false;
      });
    }
    
    if (userStreamManager) {
      // Handle user data updates (orders, positions, account)
      userStreamManager.onMessage((data: any) => {
        this.handleUserDataUpdate(data as UserDataStreamData);
      });
      
      userStreamManager.onError((error: Error) => {
        console.error('👤 User stream error:', error.message);
      });
      
      userStreamManager.onClose(() => {
        console.warn('👤 User stream disconnected');
      });
    }
  }

  private handleMarketDataUpdate(data: MarketStreamData): void {
    try {
      if (data.stream.includes('@ticker')) {
        // Handle 24hr ticker updates
        const ticker = data.data;
        if (ticker.c) { // Current price
          const symbol = ticker.s;
          const price = parseFloat(ticker.c);
          this.priceCache.set(symbol, price);
          this.lastPriceUpdate = Date.now();
        }
      } else if (data.stream.includes('@kline')) {
        // Handle kline/candlestick updates
        const kline = data.data;
        if (kline.k && kline.k.x) { // Closed kline
          const symbol = kline.k.s;
          const closePrice = parseFloat(kline.k.c);
          this.priceCache.set(symbol, closePrice);
          this.lastPriceUpdate = Date.now();
        }
      }
    } catch (error) {
      console.error('❌ Error handling market data update:', error);
    }
  }

  private handleUserDataUpdate(data: UserDataStreamData): void {
    try {
      switch (data.e) {
        case 'ACCOUNT_UPDATE':
          console.log('💰 Account balance updated via WebSocket');
          break;
          
        case 'ORDER_TRADE_UPDATE':
          console.log(`📋 Order update: ${data.o?.s} ${data.o?.S} ${data.o?.X}`);
          break;
          
        case 'executionReport':
          console.log(`⚡ Execution report: ${data.s} ${data.S} ${data.X}`);
          break;
          
        case 'listenKeyExpired':
          console.warn('🔑 Listen key expired, reinitializing user data stream');
          this.reinitializeUserDataStream();
          break;
          
        default:
          // Handle other user data events
          break;
      }
    } catch (error) {
      console.error('❌ Error handling user data update:', error);
    }
  }

  private async reinitializeUserDataStream(): Promise<void> {
    try {
      await this.binanceClient.initializeUserDataStream();
      console.log('✅ User data stream reinitialized');
    } catch (error) {
      console.error('❌ Failed to reinitialize user data stream:', error);
    }
  }



  // Cleanup method
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Real Trader...');
    
    // Disconnect WebSocket streams
    if (this.websocketInitialized) {
      await this.binanceClient.disconnect();
    }
    
    console.log('👋 Real Trader shutdown complete');
  }
}

// Main execution
async function main() {
  // Determine if running on testnet (default to true for safety)
  const isTestnet = process.env.BINANCE_TESTNET !== 'false';
  
  // Choose appropriate API credentials
  const apiKey = isTestnet 
    ? process.env.BINANCE_TESTNET_API_KEY 
    : process.env.BINANCE_API_KEY;
  const apiSecret = isTestnet 
    ? process.env.BINANCE_TESTNET_API_SECRET 
    : process.env.BINANCE_API_SECRET;
    
  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  // Check for API credentials based on mode
  if (!apiKey) {
    missingEnvVars.push(isTestnet ? 'BINANCE_TESTNET_API_KEY' : 'BINANCE_API_KEY');
  }
  if (!apiSecret) {
    missingEnvVars.push(isTestnet ? 'BINANCE_TESTNET_API_SECRET' : 'BINANCE_API_SECRET');
  }
  
  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }
  
  const binanceConfig: BinanceConfig = {
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    testnet: isTestnet,
  };
  
  const trader = new RealTrader(binanceConfig);
  
  try {
    await trader.start();
  } catch (error) {
    console.error('💥 Failed to start real trader:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Unhandled error in main:', error);
  process.exit(1);
});
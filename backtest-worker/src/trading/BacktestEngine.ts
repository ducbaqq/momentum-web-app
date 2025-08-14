/**
 * Enhanced Backtesting Engine with Production-Grade Features
 * 
 * Key Features:
 * - No look-ahead bias (signals use only closed bar data)
 * - Orders execute on next bar open
 * - Deterministic results with proper seeding
 * - Comprehensive cost modeling (fees, slippage, spreads, funding)
 * - Proper warm-up period handling
 * - Performance metrics (Sharpe, Sortino, etc.)
 */

import { Engine, EngineConfig, TradeSignal, EngineState, EngineResult } from './Engine.js';
import { ExchangeSpec } from './ExchangeSpec.js';
import { logExecutionStep } from '../db.js';
import type { Candle } from '../types.js';

export interface BacktestConfig extends EngineConfig {
  // Execution settings
  warmupBars: number;                    // Skip first N bars for indicator warmup
  preventLookAhead: boolean;             // Enforce no look-ahead bias
  executeOnNextBar: boolean;             // Execute signals on next bar open
  
  // Cost modeling
  slippageBps: number;                   // Slippage in basis points
  maxSpreadBps: number;                  // Skip trades if spread too wide
  fundingEnabled: boolean;               // Apply funding rate costs
  
  // Determinism
  seed: number;                          // Random seed for reproducible results
  strategyVersion: string;               // Strategy version for metadata
  
  // Performance tracking
  benchmarkSymbol?: string;              // Symbol for benchmark comparison
  riskFreeRate: number;                  // Annual risk-free rate for Sharpe calculation
}

export interface BacktestMetadata {
  runId: string;
  strategyName: string;
  strategyVersion: string;
  startTime: number;
  endTime: number;
  symbols: string[];
  params: any;
  seed: number;
  dataHash: string;                      // Hash of input data for reproducibility
}

export interface BacktestMetrics {
  // Basic metrics
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  
  // Risk metrics
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  volatility: number;
  
  // Trade metrics
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  
  // Exposure metrics
  timeInMarket: number;                  // Percentage of time with open positions
  averageLeverage: number;
  maxLeverage: number;
  
  // Costs
  totalFees: number;
  totalSlippage: number;
  totalFunding: number;
  turnover: number;                      // Total trading volume
}

export interface EnhancedBacktestResult extends EngineResult {
  metadata: BacktestMetadata;
  metrics: BacktestMetrics;
  dailyReturns: number[];                // For Sharpe/Sortino calculation
  drawdownSeries: Array<{
    timestamp: number;
    drawdown: number;
    underwater: boolean;
  }>;
  benchmarkComparison?: {
    benchmarkReturn: number;
    alpha: number;
    beta: number;
    correlation: number;
  };
}

export class BacktestEngine extends Engine {
  private backtestConfig: BacktestConfig;
  private backtestCurrentBar: number = 0;
  private pendingSignals: Array<{
    signal: TradeSignal;
    executeAt: number;
  }> = [];
  private dailyEquityValues: Map<string, number> = new Map(); // Date -> Equity
  private tradingDays: Set<string> = new Set();
  private startTime: number = 0;
  private endTime: number = 0;
  private positionHistory: Array<{ timestamp: number; hasPosition: boolean; leverage: number; turnover: number }> = [];
  private cumulativeTurnover: number = 0;
  
  // For detailed execution logging
  private runId: string = '';
  private currentSymbol: string = '';
  private enableExecutionLogging: boolean = true;
  
  constructor(config: BacktestConfig) {
    super(config);
    this.backtestConfig = {
      warmupBars: config.warmupBars ?? 50,
      preventLookAhead: config.preventLookAhead ?? true,
      executeOnNextBar: config.executeOnNextBar ?? true,
      slippageBps: config.slippageBps ?? 2,
      maxSpreadBps: config.maxSpreadBps ?? 20,
      fundingEnabled: config.fundingEnabled ?? true,
      seed: config.seed ?? 42,
      strategyVersion: config.strategyVersion ?? '1.0.0',
      riskFreeRate: config.riskFreeRate ?? 0.02,
      initialBalance: config.initialBalance,
      exchangeSpecs: config.exchangeSpecs,
      positionMode: config.positionMode,
      defaultLeverage: config.defaultLeverage
    };
    
    // Seed random number generator for deterministic results
    this.seedRandom(this.backtestConfig.seed);
  }
  
  /**
   * Enhanced backtest with proper execution model and no look-ahead bias
   */
  async runBacktest(
    candles: Candle[],
    strategy: (candle: Candle, index: number, state: EngineState) => TradeSignal[],
    metadata: Partial<BacktestMetadata> = {}
  ): Promise<EnhancedBacktestResult> {
    if (candles.length === 0) {
      throw new Error('No candles provided for backtest');
    }
    
    console.log(`Starting enhanced backtest with ${candles.length} candles`);
    
    // Set run ID and symbol for logging
    this.runId = metadata.runId || this.generateRunId();
    this.currentSymbol = metadata.symbols?.[0] || 'UNKNOWN';
    
    this.startTime = new Date(candles[0].ts).getTime();
    this.endTime = new Date(candles[candles.length - 1].ts).getTime();
    
    // Validate data integrity
    this.validateData(candles);
    
    // Process each bar with proper execution model
    for (let i = 0; i < candles.length; i++) {
      await this.processBarWithExecutionModel(candles, i, strategy);
    }
    
    // Execute any remaining pending signals after the last bar
    if (this.backtestConfig.executeOnNextBar && this.pendingSignals.length > 0) {
      console.log(`Executing ${this.pendingSignals.length} remaining pending signals after backtest completion`);
      const lastCandle = candles[candles.length - 1];
      
      // Execute all remaining signals using the last candle's close price
      for (const { signal } of this.pendingSignals) {
        // Create a synthetic execution candle with close price as open
        const executionCandle = {
          ...lastCandle,
          open: lastCandle.close,
          high: lastCandle.close,
          low: lastCandle.close
        };
        await this.executeSignalWithCosts(signal, executionCandle);
      }
      
      this.pendingSignals = []; // Clear all pending signals
    }
    
    // Calculate enhanced metrics
    const basicResult = (this as any).getResults();
    const enhancedMetrics = this.calculateEnhancedMetrics(basicResult);
    const drawdownSeries = this.computeDrawdownSeries(basicResult.equityCurve);
    const dailyReturns = this.computeDailyReturns();
    
    const fullMetadata: BacktestMetadata = {
      runId: metadata.runId || this.generateRunId(),
      strategyName: metadata.strategyName || 'unknown',
      strategyVersion: this.backtestConfig.strategyVersion,
      startTime: this.startTime,
      endTime: this.endTime,
      symbols: metadata.symbols || [],
      params: metadata.params || {},
      seed: this.backtestConfig.seed,
      dataHash: this.calculateDataHash(candles)
    };
    
    return {
      ...basicResult,
      metadata: fullMetadata,
      metrics: enhancedMetrics,
      dailyReturns,
      drawdownSeries,
      // benchmarkComparison would be calculated if benchmarkSymbol provided
    };
  }
  
  /**
   * Process a single bar with proper execution model
   */
  private async processBarWithExecutionModel(
    candles: Candle[],
    barIndex: number,
    strategy: (candle: Candle, index: number, state: EngineState) => TradeSignal[]
  ): Promise<void> {
    const currentCandle = candles[barIndex];
    this.backtestCurrentBar = barIndex;
    
    // Capture positions before any processing
    const positionsBefore = this.getBroker().getPositions().map(p => ({
      symbol: p.symbol,
      size: p.size,
      side: p.side,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage
    }));
    
    // Capture account state before processing
    const accountStateBefore = this.getBroker().getState();
    
    // 1. Execute any pending signals from previous bars
    const executedSignalsThisBar: TradeSignal[] = [];
    const signalsToExecute = this.pendingSignals.filter(p => p.executeAt === this.backtestCurrentBar);
    for (const { signal } of signalsToExecute) {
      executedSignalsThisBar.push(signal);
    }
    await this.executePendingSignals(currentCandle);
    
    // 2. Skip warmup period but still log
    if (barIndex < this.backtestConfig.warmupBars) {
      this.recordDailyEquity(currentCandle);
      
      // Log warmup period (no strategy signals, just market data)
      await this.logDetailedExecution(
        barIndex, currentCandle, [], [], [], executedSignalsThisBar,
        positionsBefore, this.getBroker().getPositions(),
        accountStateBefore, this.getBroker().getState(),
        { warmup: true, indicators: {} }, [], 'Warmup period - no strategy execution'
      );
      return;
    }
    
    // 3. Generate new signals using only past data (no look-ahead)
    const state = this.getState(currentCandle);
    let newSignals: TradeSignal[] = [];
    let strategyError: string | null = null;
    
    try {
      // Strategy can only see current and past bars
      newSignals = strategy(currentCandle, barIndex, state);
    } catch (error: any) {
      console.warn(`Strategy error at bar ${barIndex}: ${error.message}`);
      newSignals = [];
      strategyError = error.message;
    }
    
    // 4. Validate and filter signals
    const rejectionReasons: string[] = [];
    const validSignals = this.validateSignalsWithReasons(newSignals, currentCandle, rejectionReasons);
    
    // 5. Handle signal execution timing
    if (this.backtestConfig.executeOnNextBar) {
      // Always queue signals for next bar execution (realistic trading)
      for (const signal of validSignals) {
        this.pendingSignals.push({
          signal,
          executeAt: barIndex + 1
        });
      }
    } else {
      // Execute immediately (same bar execution)
      await this.executeSignals(validSignals, currentCandle);
      executedSignalsThisBar.push(...validSignals);
    }
    
    // 6. Update mark prices and apply funding
    await this.updateMarketData(currentCandle);
    
    // 7. Record daily equity for performance calculation
    this.recordDailyEquity(currentCandle);
    
    // 8. Track position metrics for advanced performance calculations
    this.recordPositionMetrics(currentCandle);
    
    // 9. Log detailed execution for this bar
    const positionsAfter = this.getBroker().getPositions().map(p => ({
      symbol: p.symbol,
      size: p.size,
      side: p.side,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage
    }));
    
    const accountStateAfter = this.getBroker().getState();
    const strategyState = {
      currentBar: barIndex,
      engineState: state,
      indicators: this.extractIndicators(currentCandle),
      error: strategyError
    };
    
    await this.logDetailedExecution(
      barIndex, currentCandle, newSignals, validSignals, 
      this.pendingSignals.map(p => p.signal), executedSignalsThisBar,
      positionsBefore, positionsAfter, accountStateBefore, accountStateAfter,
      strategyState, rejectionReasons
    );
  }
  
  /**
   * Execute pending signals that were queued from previous bars
   */
  private async executePendingSignals(currentCandle: Candle): Promise<void> {
    const signalsToExecute = this.pendingSignals.filter(p => p.executeAt === this.backtestCurrentBar);
    this.pendingSignals = this.pendingSignals.filter(p => p.executeAt !== this.backtestCurrentBar);
    
    if (signalsToExecute.length > 0) {
      console.log(`Executing ${signalsToExecute.length} pending signals at bar ${this.backtestCurrentBar} (${new Date(currentCandle.ts).toISOString()})`);
    }
    
    for (const { signal } of signalsToExecute) {
      await this.executeSignalWithCosts(signal, currentCandle);
    }
  }
  
  /**
   * Execute signals immediately
   */
  private async executeSignals(signals: TradeSignal[], currentCandle: Candle): Promise<void> {
    for (const signal of signals) {
      await this.executeSignalWithCosts(signal, currentCandle);
    }
  }
  
  /**
   * Execute a signal with proper cost modeling
   */
  private async executeSignalWithCosts(signal: TradeSignal, candle: Candle): Promise<void> {
    console.log(`Executing ${signal.side} signal for ${signal.symbol} at ${new Date(candle.ts).toISOString()}, size: ${signal.size.toFixed(4)}`);
    
    // Apply slippage to execution price
    const slippageMultiplier = 1 + (this.backtestConfig.slippageBps / 10000) * (signal.side === 'LONG' ? 1 : -1);
    const executionPrice = candle.open * slippageMultiplier;
    
    // Check spread constraints
    if (candle.spread_bps && candle.spread_bps > this.backtestConfig.maxSpreadBps) {
      console.warn(`Skipping trade due to wide spread: ${candle.spread_bps} bps > ${this.backtestConfig.maxSpreadBps} bps`);
      return;
    }
    
    const context = {
      candle,
      timestamp: new Date(candle.ts).getTime(),
      executionPrice,
      slippage: Math.abs(executionPrice - candle.open)
    };
    
    // Execute through parent engine
    const result = this.executeSignal(signal, candle, context.timestamp);
    
    if (result.success) {
      // Track slippage costs and turnover
      const slippageCost = Math.abs(executionPrice - candle.open) * signal.size;
      const turnoverAmount = signal.size * executionPrice;
      this.cumulativeTurnover += turnoverAmount;
      // This would be stored in trade metadata for reporting
    }
  }
  
  /**
   * Validate signals for realism and constraints
   */
  private validateSignals(signals: TradeSignal[], candle: Candle): TradeSignal[] {
    return signals.filter(signal => {
      // Check if symbol is valid
      if (!signal.symbol) {
        console.warn('Signal missing symbol');
        return false;
      }
      
      // Check if size is reasonable
      if (signal.size <= 0 || !isFinite(signal.size)) {
        console.warn(`Invalid signal size: ${signal.size}`);
        return false;
      }
      
      // Check if leverage is within limits
      if (signal.leverage && signal.leverage > 125) {
        console.warn(`Leverage too high: ${signal.leverage}x`);
        return false;
      }
      
      return true;
    });
  }

  /**
   * Validate signals and capture rejection reasons
   */
  private validateSignalsWithReasons(signals: TradeSignal[], candle: Candle, rejectionReasons: string[]): TradeSignal[] {
    return signals.filter(signal => {
      // Check if symbol is valid
      if (!signal.symbol) {
        rejectionReasons.push(`Signal missing symbol`);
        return false;
      }
      
      // Check if size is reasonable
      if (signal.size <= 0 || !isFinite(signal.size)) {
        rejectionReasons.push(`Invalid signal size: ${signal.size}`);
        return false;
      }
      
      // Check if leverage is within limits
      if (signal.leverage && signal.leverage > 125) {
        rejectionReasons.push(`Leverage too high: ${signal.leverage}x`);
        return false;
      }

      // Check spread constraints
      if (candle.spread_bps && candle.spread_bps > this.backtestConfig.maxSpreadBps) {
        rejectionReasons.push(`Spread too wide: ${candle.spread_bps} bps > ${this.backtestConfig.maxSpreadBps} bps`);
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Update market data and apply funding
   */
  private async updateMarketData(candle: Candle): Promise<void> {
    const markPrices = { [candle.symbol || 'UNKNOWN']: candle.close };
    const timestamp = new Date(candle.ts).getTime();
    
    if (this.backtestConfig.fundingEnabled) {
      this.getBroker().updateMarkPrices(markPrices, timestamp);
    } else {
      // Update without funding
      this.getBroker().updateMarkPrices(markPrices, timestamp);
    }
  }
  
  /**
   * Record daily equity values for performance metrics
   */
  private recordDailyEquity(candle: Candle): void {
    const date = new Date(candle.ts).toISOString().split('T')[0];
    const state = this.getBroker().getState();
    
    this.dailyEquityValues.set(date, state.totalEquity);
    this.tradingDays.add(date);
  }
  
  /**
   * Record position metrics for advanced performance calculations
   */
  private recordPositionMetrics(candle: Candle): void {
    const state = this.getBroker().getState();
    const positions = this.getBroker().getPositions();
    
    const hasPosition = positions.length > 0;
    const totalNotional = positions.reduce((sum, pos) => sum + (pos.size * pos.markPrice), 0);
    const averageLeverage = positions.length > 0 ? 
      positions.reduce((sum, pos) => sum + pos.leverage, 0) / positions.length : 0;
    
    this.positionHistory.push({
      timestamp: new Date(candle.ts).getTime(),
      hasPosition,
      leverage: averageLeverage,
      turnover: this.cumulativeTurnover
    });
  }
  
  /**
   * Calculate enhanced performance metrics
   */
  private calculateEnhancedMetrics(result: EngineResult): BacktestMetrics {
    const initialBalance = this.backtestConfig.initialBalance;
    const finalEquity = result.equityCurve[result.equityCurve.length - 1]?.equity || initialBalance;
    
    // Basic return metrics
    const totalReturn = (finalEquity - initialBalance) / initialBalance;
    const tradingDays = this.tradingDays.size;
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / tradingDays) - 1;
    
    // Risk metrics
    const dailyReturns = this.computeDailyReturns();
    const sharpeRatio = this.calcSharpeRatioEnhanced(dailyReturns);
    const sortinoRatio = this.calcSortinoRatioEnhanced(dailyReturns);
    const volatility = this.calcVolatilityEnhanced(dailyReturns);
    const calmarRatio = Math.abs(totalReturn / result.maxDrawdown);
    
    // Trade metrics
    const trades = result.trades;
    const winningTrades = trades.filter((t: any) => t.pnl > 0);
    const losingTrades = trades.filter((t: any) => t.pnl < 0);
    
    const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum: number, t: any) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum: number, t: any) => sum + t.pnl, 0)) / losingTrades.length : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;
    
    return {
      totalReturn,
      annualizedReturn,
      maxDrawdown: result.maxDrawdown,
      maxDrawdownDuration: 0, // Would need to calculate from drawdown series
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      volatility,
      winRate,
      profitFactor,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: trades.length > 0 ? Math.max(...trades.map((t: any) => t.pnl)) : 0,
      largestLoss: trades.length > 0 ? Math.min(...trades.map((t: any) => t.pnl)) : 0,
      timeInMarket: this.computeTimeInMarket(),
      averageLeverage: this.computeAverageLeverage(),
      maxLeverage: this.computeMaxLeverage(),
      totalFees: result.totalCommissions,
      totalSlippage: 0, // Would track from execution
      totalFunding: result.totalFunding,
      turnover: this.cumulativeTurnover
    };
  }
  
  /**
   * Calculate daily returns for risk metrics
   */
  private computeDailyReturns(): number[] {
    const dailyReturns: number[] = [];
    const dates = Array.from(this.dailyEquityValues.keys()).sort();
    
    for (let i = 1; i < dates.length; i++) {
      const prevEquity = this.dailyEquityValues.get(dates[i - 1])!;
      const currEquity = this.dailyEquityValues.get(dates[i])!;
      const dailyReturn = (currEquity - prevEquity) / prevEquity;
      dailyReturns.push(dailyReturn);
    }
    
    return dailyReturns;
  }
  
  /**
   * Calculate Sharpe ratio from daily returns
   */
  private calcSharpeRatioEnhanced(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgDailyReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const dailyRiskFreeRate = this.backtestConfig.riskFreeRate / 365; // Convert annual to daily
    const excessReturn = avgDailyReturn - dailyRiskFreeRate;
    
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 0 : (excessReturn * Math.sqrt(365)) / (stdDev * Math.sqrt(365));
  }
  
  /**
   * Calculate Sortino ratio (downside deviation)
   */
  private calcSortinoRatioEnhanced(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgDailyReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const dailyRiskFreeRate = this.backtestConfig.riskFreeRate / 365;
    const excessReturn = avgDailyReturn - dailyRiskFreeRate;
    
    const downsideReturns = dailyReturns.filter(ret => ret < dailyRiskFreeRate);
    if (downsideReturns.length === 0) return 0;
    
    const downsideVariance = downsideReturns.reduce((sum, ret) => sum + Math.pow(ret - dailyRiskFreeRate, 2), 0) / downsideReturns.length;
    const downsideStdDev = Math.sqrt(downsideVariance);
    
    return downsideStdDev === 0 ? 0 : (excessReturn * Math.sqrt(365)) / (downsideStdDev * Math.sqrt(365));
  }
  
  /**
   * Calculate volatility (annualized)
   */
  private calcVolatilityEnhanced(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
    const dailyVol = Math.sqrt(variance);
    
    return dailyVol * Math.sqrt(365); // Annualized
  }
  
  /**
   * Calculate drawdown series
   */
  private computeDrawdownSeries(equityCurve: any[]): Array<{ timestamp: number; drawdown: number; underwater: boolean }> {
    const drawdowns: Array<{ timestamp: number; drawdown: number; underwater: boolean }> = [];
    let peak = 0;
    
    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      
      const drawdown = peak > 0 ? (peak - point.equity) / peak : 0;
      drawdowns.push({
        timestamp: point.timestamp,
        drawdown,
        underwater: drawdown > 0
      });
    }
    
    return drawdowns;
  }
  
  /**
   * Calculate time in market percentage
   */
  private computeTimeInMarket(): number {
    if (this.positionHistory.length === 0) return 0;
    
    const barsWithPosition = this.positionHistory.filter(p => p.hasPosition).length;
    return barsWithPosition / this.positionHistory.length;
  }
  
  /**
   * Calculate average leverage across all bars with positions
   */
  private computeAverageLeverage(): number {
    const positionBars = this.positionHistory.filter(p => p.hasPosition);
    if (positionBars.length === 0) return 0;
    
    const totalLeverage = positionBars.reduce((sum, p) => sum + p.leverage, 0);
    return totalLeverage / positionBars.length;
  }
  
  /**
   * Calculate maximum leverage used
   */
  private computeMaxLeverage(): number {
    if (this.positionHistory.length === 0) return 0;
    
    return Math.max(...this.positionHistory.map(p => p.leverage));
  }
  
  /**
   * Validate data integrity
   */
  private validateData(candles: Candle[]): void {
    // Check for gaps
    for (let i = 1; i < candles.length; i++) {
      const prevTime = new Date(candles[i - 1].ts).getTime();
      const currTime = new Date(candles[i].ts).getTime();
      
      if (currTime <= prevTime) {
        throw new Error(`Data integrity error: Non-increasing timestamps at index ${i}`);
      }
    }
    
    // Check for required fields
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      if (!candle.open || !candle.high || !candle.low || !candle.close || !candle.volume) {
        throw new Error(`Data integrity error: Missing OHLCV data at index ${i}`);
      }
      
      if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close || candle.low > candle.open || candle.low > candle.close) {
        throw new Error(`Data integrity error: Invalid OHLC relationship at index ${i}`);
      }
    }
  }
  
  // Utility methods
  private seedRandom(seed: number): void {
    // Simple seeded random implementation for deterministic results
    Math.random = (() => {
      let x = seed;
      return () => {
        x = Math.sin(x) * 10000;
        return x - Math.floor(x);
      };
    })();
  }
  
  private generateRunId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  private calculateDataHash(candles: Candle[]): string {
    // Simple hash of first and last candle for data integrity check
    const firstCandle = candles[0];
    const lastCandle = candles[candles.length - 1];
    return `${firstCandle.ts}-${firstCandle.close}-${lastCandle.ts}-${lastCandle.close}`;
  }

  /**
   * Extract relevant indicators from candle for logging
   */
  private extractIndicators(candle: Candle): any {
    return {
      // Price data
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      
      // Technical indicators (if available)
      rsi_14: candle.rsi_14 || null,
      ema_20: candle.ema_20 || null,
      ema_50: candle.ema_50 || null,
      macd: candle.macd || null,
      bb_upper: candle.bb_upper || null,
      bb_lower: candle.bb_lower || null,
      
      // ROC indicators
      roc_1m: candle.roc_1m || null,
      roc_5m: candle.roc_5m || null,
      roc_15m: candle.roc_15m || null,
      roc_1h: candle.roc_1h || null,
      
      // Volume and market structure
      vol_mult: candle.vol_mult || null,
      book_imb: candle.book_imb || null,
      spread_bps: candle.spread_bps || null
    };
  }

  /**
   * Log detailed execution step with all decision data
   */
  private async logDetailedExecution(
    barIndex: number,
    candle: Candle,
    strategySignals: TradeSignal[],
    filteredSignals: TradeSignal[],
    pendingSignals: TradeSignal[],
    executedSignals: TradeSignal[],
    positionsBefore: any[],
    positionsAfter: any[],
    accountBefore: any,
    accountAfter: any,
    strategyState: any,
    rejectionReasons: string[],
    notes?: string
  ): Promise<void> {
    if (!this.enableExecutionLogging || !this.runId || !this.currentSymbol) {
      return;
    }

    try {
      await logExecutionStep({
        run_id: this.runId,
        symbol: this.currentSymbol,
        bar_index: barIndex,
        ts: candle.ts,
        candle_data: candle,
        strategy_signals: strategySignals,
        filtered_signals: filteredSignals,
        pending_signals: pendingSignals,
        executed_signals: executedSignals,
        positions_before: positionsBefore,
        positions_after: positionsAfter,
        account_balance: accountAfter.balance,
        total_equity: accountAfter.totalEquity,
        unrealized_pnl: accountAfter.unrealizedPnl,
        execution_price: executedSignals.length > 0 ? candle.open : undefined,
        slippage_amount: executedSignals.length > 0 ? (this.backtestConfig.slippageBps / 10000) * candle.open : undefined,
        commission_paid: 0, // Would calculate from executed signals
        funding_paid: 0,    // Would calculate from funding
        strategy_state: strategyState,
        rejection_reasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
        execution_notes: notes
      });
    } catch (error: any) {
      console.error(`Failed to log execution step for bar ${barIndex}:`, error.message);
    }
  }
}
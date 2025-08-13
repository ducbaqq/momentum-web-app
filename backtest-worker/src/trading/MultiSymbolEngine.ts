/**
 * Multi-Symbol Backtesting Engine
 * 
 * Handles backtesting across multiple symbols simultaneously while maintaining
 * proper isolation of positions and risk management per symbol.
 */

import { BacktestEngine, BacktestConfig, EnhancedBacktestResult, BacktestMetadata } from './BacktestEngine.js';
import { DataLoader, ProfessionalCandle } from './DataLoader.js';
import { EngineState, TradeSignal } from './Engine.js';
import { Timeframe } from '../utils.js';
import type { Candle } from '../types.js';

export interface MultiSymbolCandles {
  [symbol: string]: Candle[];
}

export interface MultiSymbolState {
  timestamp: number;
  currentBar: number;
  candlesBySymbol: Record<string, Candle>;
  engineState: EngineState;
}

export interface MultiSymbolStrategy {
  generateSignals(state: MultiSymbolState): TradeSignal[];
  
  // Optional: symbol-specific strategies
  getSymbolStrategy?(symbol: string): (candle: Candle, index: number, state: EngineState) => TradeSignal[];
}

export interface MultiSymbolBacktestConfig extends BacktestConfig {
  symbols: string[];
  timeframe?: Timeframe;
  startDate: string;
  endDate: string;
  maxConcurrentPositions?: number;
  symbolAllocation?: Record<string, number>; // Percentage allocation per symbol
}

export interface MultiSymbolResult {
  aggregated: EnhancedBacktestResult;
  bySymbol: Record<string, EnhancedBacktestResult>;
  correlation: {
    returns: Record<string, Record<string, number>>;
    drawdowns: Record<string, Record<string, number>>;
  };
  diversificationMetrics: {
    portfolioSharpe: number;
    maxConcurrentDrawdown: number;
    avgCorrelation: number;
  };
}

export class MultiSymbolBacktestEngine extends BacktestEngine {
  private symbolEngines: Map<string, BacktestEngine> = new Map();
  private config: MultiSymbolBacktestConfig;

  constructor(config: MultiSymbolBacktestConfig) {
    super(config);
    this.config = {
      maxConcurrentPositions: 5,
      timeframe: '1m',
      symbolAllocation: {},
      ...config
    };
  }

  /**
   * Run multi-symbol backtest
   */
  async runMultiSymbolBacktest(
    strategy: MultiSymbolStrategy,
    metadata: Partial<BacktestMetadata> = {}
  ): Promise<MultiSymbolResult> {
    console.log(`Starting multi-symbol backtest for ${this.config.symbols.length} symbols`);

    // 1. Load data for all symbols
    const symbolCandles = await this.loadMultiSymbolData();
    
    // 2. Align timestamps across all symbols
    const alignedData = this.alignTimestamps(symbolCandles);
    
    // 3. Run the multi-symbol strategy
    const results = await this.executeMultiSymbolStrategy(alignedData, strategy, metadata);
    
    // 4. Calculate correlation and diversification metrics
    const correlation = this.calculateCorrelations(results);
    const diversificationMetrics = this.calculateDiversificationMetrics(results, correlation);
    
    // 5. Aggregate results
    const aggregatedResult = this.aggregateResults(results);

    return {
      aggregated: aggregatedResult,
      bySymbol: results,
      correlation,
      diversificationMetrics
    };
  }

  /**
   * Load data for all symbols with timeframe conversion
   */
  private async loadMultiSymbolData(): Promise<MultiSymbolCandles> {
    const symbolCandles: MultiSymbolCandles = {};
    
    const loadPromises = this.config.symbols.map(async (symbol) => {
      try {
        const candles = await DataLoader.loadProfessionalCandles(
          symbol,
          this.config.startDate,
          this.config.endDate,
          this.config.timeframe
        );
        symbolCandles[symbol] = candles;
        console.log(`Loaded ${candles.length} candles for ${symbol}`);
      } catch (error) {
        console.error(`Failed to load data for ${symbol}:`, error);
        // Continue with other symbols
      }
    });

    await Promise.all(loadPromises);
    
    const loadedSymbols = Object.keys(symbolCandles);
    console.log(`Successfully loaded data for ${loadedSymbols.length}/${this.config.symbols.length} symbols`);
    
    return symbolCandles;
  }

  /**
   * Align timestamps across all symbols to ensure synchronized execution
   */
  private alignTimestamps(symbolCandles: MultiSymbolCandles): Array<{
    timestamp: string;
    candlesBySymbol: Record<string, Candle>;
  }> {
    // Get all unique timestamps
    const allTimestamps = new Set<string>();
    for (const candles of Object.values(symbolCandles)) {
      for (const candle of candles) {
        allTimestamps.add(candle.ts);
      }
    }

    const sortedTimestamps = Array.from(allTimestamps).sort();
    
    // Create timestamp-indexed lookups for each symbol
    const symbolLookups: Record<string, Map<string, Candle>> = {};
    for (const [symbol, candles] of Object.entries(symbolCandles)) {
      symbolLookups[symbol] = new Map();
      for (const candle of candles) {
        symbolLookups[symbol].set(candle.ts, candle);
      }
    }

    // Align data (only include timestamps where all symbols have data)
    const alignedData: Array<{
      timestamp: string;
      candlesBySymbol: Record<string, Candle>;
    }> = [];

    for (const timestamp of sortedTimestamps) {
      const candlesBySymbol: Record<string, Candle> = {};
      let hasAllSymbols = true;

      for (const symbol of this.config.symbols) {
        const candle = symbolLookups[symbol]?.get(timestamp);
        if (candle) {
          candlesBySymbol[symbol] = candle;
        } else {
          hasAllSymbols = false;
          break;
        }
      }

      if (hasAllSymbols) {
        alignedData.push({ timestamp, candlesBySymbol });
      }
    }

    console.log(`Aligned ${alignedData.length} timestamps across ${this.config.symbols.length} symbols`);
    return alignedData;
  }

  /**
   * Execute the multi-symbol strategy across aligned data
   */
  private async executeMultiSymbolStrategy(
    alignedData: Array<{ timestamp: string; candlesBySymbol: Record<string, Candle> }>,
    strategy: MultiSymbolStrategy,
    metadata: Partial<BacktestMetadata>
  ): Promise<Record<string, EnhancedBacktestResult>> {
    // Create individual engines for each symbol
    for (const symbol of this.config.symbols) {
      const symbolConfig = { ...this.config };
      
      // Apply symbol-specific allocation if configured
      if (this.config.symbolAllocation?.[symbol]) {
        symbolConfig.initialBalance = this.config.initialBalance * this.config.symbolAllocation[symbol];
      } else {
        // Equal allocation across symbols
        symbolConfig.initialBalance = this.config.initialBalance / this.config.symbols.length;
      }

      this.symbolEngines.set(symbol, new BacktestEngine(symbolConfig));
    }

    // Process each timestamp
    for (let i = 0; i < alignedData.length; i++) {
      const { timestamp, candlesBySymbol } = alignedData[i];
      
      // Create multi-symbol state
      const firstCandle = Object.values(candlesBySymbol)[0];
      const engineState = this.getState(firstCandle);
      
      const multiSymbolState: MultiSymbolState = {
        timestamp: new Date(timestamp).getTime(),
        currentBar: i,
        candlesBySymbol,
        engineState
      };

      // Generate signals from strategy
      const signals = strategy.generateSignals(multiSymbolState);
      
      // Apply position limits
      const filteredSignals = this.applyPositionLimits(signals);

      // Execute signals on individual symbol engines
      for (const signal of filteredSignals) {
        const symbolEngine = this.symbolEngines.get(signal.symbol);
        const candle = candlesBySymbol[signal.symbol];
        
        if (symbolEngine && candle) {
          await this.executeSignalOnSymbolEngine(symbolEngine, signal, candle, i);
        }
      }
    }

    // Get results from all engines
    const results: Record<string, EnhancedBacktestResult> = {};
    for (const [symbol, engine] of this.symbolEngines) {
      const symbolCandles = alignedData.map(d => d.candlesBySymbol[symbol]);
      
      // Use a simple strategy that returns no signals since we already executed
      const emptyStrategy = () => [];
      
      results[symbol] = await engine.runBacktest(symbolCandles, emptyStrategy, {
        ...metadata,
        strategyName: `${metadata.strategyName || 'MultiSymbol'}_${symbol}`,
        symbols: [symbol]
      });
    }

    return results;
  }

  /**
   * Execute signal on individual symbol engine
   */
  private async executeSignalOnSymbolEngine(
    engine: BacktestEngine,
    signal: TradeSignal,
    candle: Candle,
    barIndex: number
  ): Promise<void> {
    console.log(`MultiSymbol: Executing ${signal.side} signal for ${signal.symbol} at bar ${barIndex} (${new Date(candle.ts).toISOString()})`);
    
    // Use the proper execution model through the engine's processBar method
    // instead of calling executeSignal directly
    
    // Set the current bar for proper timing
    (engine as any).currentBar = barIndex;
    
    // Process the signal through the engine's proper execution logic
    // This ensures proper timing and cost modeling
    const state = engine.getState(candle);
    const signals = [signal];
    
    // Execute through the engine's proper bar processing
    engine.processBar(candle, signals);
  }

  /**
   * Apply position limits to prevent over-concentration
   */
  private applyPositionLimits(signals: TradeSignal[]): TradeSignal[] {
    if (!this.config.maxConcurrentPositions) {
      return signals;
    }

    // Count current positions across all engines
    let currentPositions = 0;
    for (const engine of this.symbolEngines.values()) {
      currentPositions += engine.getBroker().getPositions().length;
    }

    // Filter new entry signals if we're at the limit
    const filtered: TradeSignal[] = [];
    let newPositions = 0;

    for (const signal of signals) {
      const symbolEngine = this.symbolEngines.get(signal.symbol);
      const hasPosition = symbolEngine?.getBroker().getPosition(signal.symbol) !== null;
      
      if (!hasPosition && signal.size > 0) {
        // This is a new entry
        if (currentPositions + newPositions < this.config.maxConcurrentPositions!) {
          filtered.push(signal);
          newPositions++;
        } else {
          console.log(`Skipping entry for ${signal.symbol} due to position limit`);
        }
      } else {
        // This is an exit or modification
        filtered.push(signal);
      }
    }

    return filtered;
  }

  /**
   * Calculate correlation matrices between symbols
   */
  private calculateCorrelations(results: Record<string, EnhancedBacktestResult>) {
    const symbols = Object.keys(results);
    const returnsCorr: Record<string, Record<string, number>> = {};
    const drawdownsCorr: Record<string, Record<string, number>> = {};

    // Initialize matrices
    for (const symbol1 of symbols) {
      returnsCorr[symbol1] = {};
      drawdownsCorr[symbol1] = {};
      
      for (const symbol2 of symbols) {
        if (symbol1 === symbol2) {
          returnsCorr[symbol1][symbol2] = 1.0;
          drawdownsCorr[symbol1][symbol2] = 1.0;
        } else {
          // Calculate correlation between daily returns
          const returns1 = results[symbol1].dailyReturns;
          const returns2 = results[symbol2].dailyReturns;
          returnsCorr[symbol1][symbol2] = this.calculateCorrelation(returns1, returns2);
          
          // Calculate correlation between drawdowns
          const dd1 = results[symbol1].drawdownSeries.map(d => d.drawdown);
          const dd2 = results[symbol2].drawdownSeries.map(d => d.drawdown);
          drawdownsCorr[symbol1][symbol2] = this.calculateCorrelation(dd1, dd2);
        }
      }
    }

    return { returns: returnsCorr, drawdowns: drawdownsCorr };
  }

  /**
   * Calculate correlation coefficient between two series
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSq = 0;
    let sumYSq = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      
      numerator += dx * dy;
      sumXSq += dx * dx;
      sumYSq += dy * dy;
    }

    const denominator = Math.sqrt(sumXSq * sumYSq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate diversification metrics
   */
  private calculateDiversificationMetrics(
    results: Record<string, EnhancedBacktestResult>,
    correlation: { returns: Record<string, Record<string, number>>; drawdowns: Record<string, Record<string, number>> }
  ) {
    const symbols = Object.keys(results);
    
    // Calculate portfolio-level Sharpe ratio
    const totalPnl = Object.values(results).reduce((sum, r) => sum + r.totalPnl, 0);
    const totalInitialBalance = Object.values(results).reduce((sum, r) => sum + this.config.initialBalance / symbols.length, 0);
    const portfolioReturn = totalPnl / totalInitialBalance;
    
    // Aggregate daily returns (weighted)
    const portfolioDailyReturns: number[] = [];
    const maxLength = Math.max(...Object.values(results).map(r => r.dailyReturns.length));
    
    for (let i = 0; i < maxLength; i++) {
      let dayReturn = 0;
      let validSymbols = 0;
      
      for (const symbol of symbols) {
        if (i < results[symbol].dailyReturns.length) {
          dayReturn += results[symbol].dailyReturns[i] / symbols.length;
          validSymbols++;
        }
      }
      
      if (validSymbols > 0) {
        portfolioDailyReturns.push(dayReturn);
      }
    }

    const portfolioSharpe = this.calculateSharpeFromReturns(portfolioDailyReturns);

    // Calculate max concurrent drawdown
    const maxConcurrentDrawdown = Math.max(...Object.values(results).map(r => r.metrics.maxDrawdown));

    // Calculate average correlation
    let correlationSum = 0;
    let correlationCount = 0;
    
    for (const symbol1 of symbols) {
      for (const symbol2 of symbols) {
        if (symbol1 !== symbol2) {
          correlationSum += Math.abs(correlation.returns[symbol1][symbol2]);
          correlationCount++;
        }
      }
    }
    
    const avgCorrelation = correlationCount > 0 ? correlationSum / correlationCount : 0;

    return {
      portfolioSharpe,
      maxConcurrentDrawdown,
      avgCorrelation
    };
  }

  /**
   * Calculate Sharpe ratio from daily returns
   */
  private calculateSharpeFromReturns(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 0 : (avgReturn * Math.sqrt(365)) / (stdDev * Math.sqrt(365));
  }

  /**
   * Aggregate results across all symbols
   */
  private aggregateResults(results: Record<string, EnhancedBacktestResult>): EnhancedBacktestResult {
    const symbols = Object.keys(results);
    const firstResult = Object.values(results)[0];
    
    // Aggregate trades
    const allTrades = Object.values(results).flatMap(r => r.trades);
    
    // Aggregate equity curve (sum across symbols)
    const aggregatedEquity: Array<{ timestamp: number; equity: number; balance: number; unrealizedPnl: number }> = [];
    const maxLength = Math.max(...Object.values(results).map(r => r.equityCurve.length));
    
    for (let i = 0; i < maxLength; i++) {
      let totalEquity = 0;
      let totalBalance = 0;
      let totalUnrealizedPnl = 0;
      let timestamp = 0;
      
      for (const result of Object.values(results)) {
        if (i < result.equityCurve.length) {
          totalEquity += result.equityCurve[i].equity;
          totalBalance += result.equityCurve[i].balance;
          totalUnrealizedPnl += result.equityCurve[i].unrealizedPnl;
          timestamp = result.equityCurve[i].timestamp;
        }
      }
      
      aggregatedEquity.push({
        timestamp,
        equity: totalEquity,
        balance: totalBalance,
        unrealizedPnl: totalUnrealizedPnl
      });
    }

    // Calculate aggregated metrics
    const totalPnl = Object.values(results).reduce((sum, r) => sum + r.totalPnl, 0);
    const totalCommissions = Object.values(results).reduce((sum, r) => sum + r.totalCommissions, 0);
    const totalFunding = Object.values(results).reduce((sum, r) => sum + r.totalFunding, 0);
    const maxDrawdown = Math.max(...Object.values(results).map(r => r.metrics.maxDrawdown));

    return {
      ...firstResult,
      finalBalance: Object.values(results).reduce((sum, r) => sum + r.finalBalance, 0),
      totalPnl,
      totalTrades: allTrades.length,
      totalCommissions,
      totalFunding,
      maxDrawdown,
      trades: allTrades,
      equityCurve: aggregatedEquity,
      metadata: {
        ...firstResult.metadata,
        symbols,
        strategyName: `MultiSymbol_${firstResult.metadata.strategyName}`
      }
    };
  }
}
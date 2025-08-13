/**
 * Comprehensive Multi-Symbol Backtesting Example
 * 
 * This example demonstrates:
 * 1. Loading data for multiple symbols with different timeframes
 * 2. Implementing a multi-symbol momentum strategy
 * 3. Running backtests with proper risk management
 * 4. Analyzing correlation and diversification metrics
 */

import { MultiSymbolBacktestEngine, MultiSymbolStrategy, MultiSymbolState } from '../trading/MultiSymbolEngine.js';
import { BacktestEngine, BacktestConfig } from '../trading/BacktestEngine.js';
import { DataLoader } from '../trading/DataLoader.js';
import { TradeSignal } from '../trading/Engine.js';
import { Timeframe } from '../utils.js';

/**
 * Multi-Symbol Momentum Strategy
 * 
 * This strategy:
 * - Looks for momentum across multiple crypto pairs
 * - Manages risk by limiting concurrent positions
 * - Uses correlation-based position sizing
 * - Implements dynamic stop-losses
 */
class MultiSymbolMomentumStrategy implements MultiSymbolStrategy {
  private config: {
    minMomentum: number;         // Minimum ROC to enter
    maxConcurrentPositions: number;
    riskPerPosition: number;     // % of portfolio per position
    stopLossPercent: number;
    takeProfitPercent: number;
    maxCorrelation: number;      // Skip if too correlated with existing positions
  };

  private activePositions: Map<string, {
    entryPrice: number;
    entryTime: number;
    stopLoss: number;
    takeProfit: number;
  }> = new Map();

  constructor(config: any = {}) {
    this.config = {
      minMomentum: 0.03,           // 3% momentum
      maxConcurrentPositions: 4,
      riskPerPosition: 0.25,       // 25% per position
      stopLossPercent: 0.05,       // 5% stop loss
      takeProfitPercent: 0.15,     // 15% take profit
      maxCorrelation: 0.7,         // Max 70% correlation
      ...config
    };
  }

  generateSignals(state: MultiSymbolState): TradeSignal[] {
    const signals: TradeSignal[] = [];
    
    // Check exit conditions first
    for (const [symbol, position] of this.activePositions) {
      const candle = state.candlesBySymbol[symbol];
      if (!candle) continue;

      const exitSignal = this.checkExitConditions(symbol, candle, position);
      if (exitSignal) {
        signals.push(exitSignal);
        this.activePositions.delete(symbol);
      }
    }

    // Check entry conditions if we have room for more positions
    if (this.activePositions.size < this.config.maxConcurrentPositions) {
      for (const [symbol, candle] of Object.entries(state.candlesBySymbol)) {
        // Skip if already have position
        if (this.activePositions.has(symbol)) continue;

        const entrySignal = this.checkEntryConditions(symbol, candle, state);
        if (entrySignal) {
          signals.push(entrySignal);
          
          // Track the new position
          this.activePositions.set(symbol, {
            entryPrice: candle.close,
            entryTime: state.timestamp,
            stopLoss: candle.close * (1 - this.config.stopLossPercent),
            takeProfit: candle.close * (1 + this.config.takeProfitPercent)
          });

          // Only take one new position per bar
          break;
        }
      }
    }

    return signals;
  }

  private checkEntryConditions(symbol: string, candle: any, state: MultiSymbolState): TradeSignal | null {
    // Check momentum requirements
    if (!candle.roc_5m || candle.roc_5m < this.config.minMomentum) {
      return null;
    }

    // Check volume confirmation
    if (!candle.vol_mult || candle.vol_mult < 1.5) {
      return null;
    }

    // Check RSI not overbought
    if (candle.rsi_14 && candle.rsi_14 > 75) {
      return null;
    }

    // Check spread
    if (candle.spread_bps && candle.spread_bps > 20) {
      return null;
    }

    // Calculate position size
    const equity = state.engineState.totalEquity;
    const riskAmount = equity * this.config.riskPerPosition;
    const positionSize = riskAmount / candle.close;

    return {
      symbol,
      side: 'LONG',
      size: positionSize,
      leverage: 1,
      type: 'MARKET'
    };
  }

  private checkExitConditions(
    symbol: string, 
    candle: any, 
    position: any
  ): TradeSignal | null {
    // Stop loss
    if (candle.close <= position.stopLoss) {
      return {
        symbol,
        side: 'SHORT',
        size: 0, // Close position
        type: 'MARKET'
      };
    }

    // Take profit
    if (candle.close >= position.takeProfit) {
      return {
        symbol,
        side: 'SHORT',
        size: 0, // Close position
        type: 'MARKET'
      };
    }

    // Momentum reversal
    if (candle.roc_1m && candle.roc_1m < -0.02) {
      return {
        symbol,
        side: 'SHORT',
        size: 0, // Close position
        type: 'MARKET'
      };
    }

    return null;
  }
}

/**
 * Run a comprehensive multi-symbol backtest
 */
export async function runMultiSymbolBacktest() {
  console.log('=== Multi-Symbol Momentum Backtesting Example ===\n');

  // 1. Define test parameters
  const symbols = ['BTCUSDT', 'ETHUSDT'];
  const timeframe: Timeframe = '15m';  // Use 15-minute bars
  const startDate = '2024-01-01';
  const endDate = '2024-01-31';
  const initialBalance = 10000;

  // 2. Configure the multi-symbol backtest engine
  const config: any = {
    symbols,
    timeframe,
    startDate,
    endDate,
    initialBalance,
    maxConcurrentPositions: 3,
    symbolAllocation: {
      'BTCUSDT': 0.6,  // 60% allocation
      'ETHUSDT': 0.4   // 40% allocation
    },
    
    // Enhanced backtest settings
    warmupBars: 50,
    executeOnNextBar: true,
    slippageBps: 3,
    maxSpreadBps: 15,
    fundingEnabled: true,
    seed: 12345,
    strategyVersion: '2.0.0',
    riskFreeRate: 0.025  // 2.5% annual risk-free rate
  };

  // 3. Create the engine and strategy
  const engine = new MultiSymbolBacktestEngine(config);
  const strategy = new MultiSymbolMomentumStrategy({
    minMomentum: 0.025,
    maxConcurrentPositions: 3,
    riskPerPosition: 0.3,
    stopLossPercent: 0.04,
    takeProfitPercent: 0.12,
    maxCorrelation: 0.65
  });

  try {
    // 4. Run the backtest
    console.log(`Loading data for ${symbols.length} symbols...`);
    const startTime = Date.now();
    
    const results = await engine.runMultiSymbolBacktest(strategy, {
      strategyName: 'MultiSymbolMomentum',
      params: {
        symbols,
        timeframe,
        minMomentum: 0.025,
        maxPositions: 3,
        riskPerPosition: 0.3
      }
    });

    const endTime = Date.now();
    console.log(`Backtest completed in ${(endTime - startTime) / 1000}s\n`);

    // 5. Display results
    displayResults(results);

  } catch (error) {
    console.error('Backtest failed:', error);
  }
}

/**
 * Display comprehensive backtest results
 */
function displayResults(results: any) {
  console.log('=== AGGREGATED RESULTS ===');
  const agg = results.aggregated;
  
  console.log(`Total P&L: $${agg.totalPnl.toFixed(2)}`);
  console.log(`Total Return: ${(agg.metrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`Annualized Return: ${(agg.metrics.annualizedReturn * 100).toFixed(2)}%`);
  console.log(`Max Drawdown: ${(agg.metrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`Sharpe Ratio: ${agg.metrics.sharpeRatio.toFixed(3)}`);
  console.log(`Sortino Ratio: ${agg.metrics.sortinoRatio.toFixed(3)}`);
  console.log(`Total Trades: ${agg.totalTrades}`);
  console.log(`Win Rate: ${(agg.metrics.winRate * 100).toFixed(1)}%`);
  console.log(`Profit Factor: ${agg.metrics.profitFactor.toFixed(2)}`);
  console.log(`Time in Market: ${(agg.metrics.timeInMarket * 100).toFixed(1)}%`);
  console.log(`Average Leverage: ${agg.metrics.averageLeverage.toFixed(2)}x`);
  console.log(`Total Turnover: $${agg.metrics.turnover.toFixed(2)}`);
  console.log(`Total Fees: $${agg.metrics.totalFees.toFixed(2)}`);

  console.log('\n=== PER-SYMBOL BREAKDOWN ===');
  for (const [symbol, result] of Object.entries(results.bySymbol)) {
    const r = result as any;
    console.log(`\n${symbol}:`);
    console.log(`  P&L: $${r.totalPnl.toFixed(2)}`);
    console.log(`  Return: ${(r.metrics.totalReturn * 100).toFixed(2)}%`);
    console.log(`  Trades: ${r.totalTrades}`);
    console.log(`  Win Rate: ${(r.metrics.winRate * 100).toFixed(1)}%`);
    console.log(`  Max DD: ${(r.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`  Sharpe: ${r.metrics.sharpeRatio.toFixed(3)}`);
  }

  console.log('\n=== DIVERSIFICATION METRICS ===');
  const div = results.diversificationMetrics;
  console.log(`Portfolio Sharpe: ${div.portfolioSharpe.toFixed(3)}`);
  console.log(`Max Concurrent Drawdown: ${(div.maxConcurrentDrawdown * 100).toFixed(2)}%`);
  console.log(`Average Correlation: ${(div.avgCorrelation * 100).toFixed(1)}%`);

  console.log('\n=== CORRELATION MATRIX (Returns) ===');
  const symbols = Object.keys(results.bySymbol);
  console.log('     ', symbols.map(s => s.slice(0, 6).padEnd(6)).join(' '));
  for (const symbol1 of symbols) {
    const row = symbols.map(symbol2 => 
      results.correlation.returns[symbol1][symbol2].toFixed(2).padStart(6)
    ).join(' ');
    console.log(`${symbol1.slice(0, 6).padEnd(6)} ${row}`);
  }
}

/**
 * Example of single-symbol backtest with timeframes
 */
export async function runSingleSymbolWithTimeframes() {
  console.log('\n=== Single Symbol Timeframe Comparison ===\n');

  const symbol = 'BTCUSDT';
  const timeframes: Timeframe[] = ['15m', '1h'];
  const startDate = '2024-01-01';
  const endDate = '2024-01-31';

  for (const timeframe of timeframes) {
    console.log(`Testing ${symbol} on ${timeframe} timeframe...`);

    try {
      // Load data with timeframe conversion
      const candles = await DataLoader.loadProfessionalCandles(
        symbol,
        startDate,
        endDate,
        timeframe
      );

      console.log(`Loaded ${candles.length} ${timeframe} candles`);

      // Simple momentum strategy
      const config: BacktestConfig = {
        initialBalance: 10000,
        warmupBars: 20,
        executeOnNextBar: true,
        slippageBps: 2,
        maxSpreadBps: 20,
        fundingEnabled: true,
        seed: 42,
        strategyVersion: '1.0.0',
        riskFreeRate: 0.02
      };

      const engine = new BacktestEngine(config);
      
      const result = await engine.runBacktest(candles, (candle, index, state) => {
        // Simple momentum strategy
        if (index < 25) return []; // Skip warmup
        
        if (candle.roc_5m && candle.roc_5m > 0.02 && candle.vol_mult && candle.vol_mult > 1.2) {
          return [{
            symbol,
            side: 'LONG' as const,
            size: state.totalEquity * 0.5 / candle.close,
            type: 'MARKET' as const
          }];
        }
        
        return [];
      });

      console.log(`${timeframe} Results:`);
      console.log(`  P&L: $${result.totalPnl.toFixed(2)}`);
      console.log(`  Return: ${(result.metrics.totalReturn * 100).toFixed(2)}%`);
      console.log(`  Trades: ${result.totalTrades}`);
      console.log(`  Sharpe: ${result.metrics.sharpeRatio.toFixed(3)}`);
      console.log('');

    } catch (error) {
      console.error(`Failed to test ${timeframe}:`, error);
    }
  }
}

// Example usage
if (require.main === module) {
  (async () => {
    await runMultiSymbolBacktest();
    await runSingleSymbolWithTimeframes();
  })();
}
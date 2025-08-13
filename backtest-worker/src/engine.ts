import { loadCandlesWithFeatures, writeResults, validateDataQuality } from './db.js';
import type { RunRow } from './types.js';
import { runStrategy as momentumBreakout } from './strategies/momentumBreakout.js';
import { runMomentumStrategy } from './strategies/momentumBreakoutV2.js';
import { createRegimeFilteredMomentumStrategy } from './strategies/regimeFilteredMomentum.js';
import { MultiSymbolBacktestEngine } from './trading/MultiSymbolEngine.js';
import { DataLoader } from './trading/DataLoader.js';
import { aggregateCandles } from './utils.js';

export async function runOneSymbol(run: RunRow, symbol: string) {
  console.log(`Running backtest for ${symbol} using strategy: ${run.strategy_name}`);
  
  // Validate data quality first
  const dataQuality = await validateDataQuality(symbol, run.start_ts, run.end_ts);
  console.log(`Data quality for ${symbol}:`, {
    score: dataQuality.qualityScore,
    ohlcvCount: dataQuality.ohlcvCount,
    featuresCount: dataQuality.featuresCount
  });
  
  // Warn if data quality is poor
  if (dataQuality.warnings.length > 0) {
    console.warn(`Data quality warnings for ${symbol}:`, dataQuality.warnings);
  }
  
  // Fail if data quality is too poor for reliable backtesting
  if (dataQuality.qualityScore < 0.5) {
    throw new Error(`Data quality too poor for backtesting: ${dataQuality.qualityScore.toFixed(2)} (warnings: ${dataQuality.warnings.join(', ')})`);
  }
  
    // Load data with simplified approach - try professional first, then fallback to basic
  let candles;
  let exchangeSpecs;
  let usingProfessionalData = false;
  
  console.log(`Loading data for ${symbol}`);
  
  try {
    // Try basic data first since it's most reliable
    candles = await loadCandlesWithFeatures(symbol, run.start_ts, run.end_ts);
    exchangeSpecs = undefined; // Will use defaults
    usingProfessionalData = false;
    console.log(`Successfully loaded basic data for ${symbol}: ${candles.length} candles`);
  } catch (basicDataError: any) {
    console.error(`Failed to load basic data for ${symbol}:`, basicDataError.message);
    throw new Error(`Failed to load data for ${symbol}: ${basicDataError.message}`);
  }
  
  if (candles.length === 0) {
    throw new Error(`No candle data available for ${symbol} in the specified time range`);
  }
  
  console.log(`Loaded ${candles.length} candles for ${symbol} from ${candles[0]?.ts} to ${candles[candles.length - 1]?.ts}`);

  // Extract execution parameters from form data (stored in params)
  const executionParams = {
    feeBps: run.params.feeBps || 4,
    slippageBps: run.params.slippageBps || 2, 
    leverage: run.params.leverage || 5
  };
  
  // Get starting capital from form data
  const startingCapital = run.params.starting_capital || 10000;
  
  console.log(`Using execution params for ${symbol}:`, executionParams);
  console.log(`Using starting capital for ${symbol}: $${startingCapital}`);

  // Plug strategies by name:
  switch (run.strategy_name) {
    case 'momentum_breakout': {
      // Use enhanced BacktestEngine for detailed logging
      const { BacktestEngine } = await import('./trading/BacktestEngine.js');
      
      const config = {
        initialBalance: startingCapital,
        warmupBars: 0,
        preventLookAhead: true,
        fundingEnabled: true,
        slippageBps: executionParams.slippageBps,
        maxSpreadBps: run.params.maxSpreadBps || 10,
        executeOnNextBar: false, // Use immediate execution for basic strategy
        seed: run.seed,
        strategyVersion: '1.0.0',
        riskFreeRate: 0.02
      };
      
      const engine = new BacktestEngine(config);
      
      // Create strategy function that mimics the original logic
      const momentumStrategy = (candle: any, index: number, state: any) => {
        const signals: any[] = [];
        
        if (index === 0) return signals; // Need previous candle
        
        const prevCandle = candles[index - 1];
        
        // Check entry conditions (simplified momentum breakout)
        const roc5m = candle.roc_5m || 0;
        const volMult = candle.vol_mult || 1;
        const spreadBps = candle.spread_bps || 0;
        
        if (roc5m > (run.params.minRoc5m || 1.2) && 
            volMult > (run.params.minVolMult || 3) &&
            spreadBps <= (run.params.maxSpreadBps || 10)) {
          
          const riskAmount = startingCapital * 0.20; // 20% risk
          const size = riskAmount / candle.close;
          
          signals.push({
            symbol: symbol,
            side: 'LONG',
            size: size,
            type: 'MARKET',
            stopLoss: candle.close * 0.98,
            takeProfit: candle.close * 1.03,
            leverage: executionParams.leverage || 1
          });
        }
        
        return signals;
      };
      
      const enhancedResult = await engine.runBacktest(
        candles, 
        momentumStrategy,
        {
          runId: run.run_id,
          strategyName: 'momentum_breakout',
          symbols: [symbol],
          params: run.params
        }
      );
      
      // Convert enhanced result to basic format for database
      const basicResult = {
        trades: enhancedResult.trades.map((trade: any) => ({
          entryTs: trade.entryTime ? new Date(trade.entryTime).toISOString() : null,
          exitTs: trade.exitTime ? new Date(trade.exitTime).toISOString() : null,
          side: trade.side,
          qty: trade.quantity,
          entryPx: trade.entryPrice,
          exitPx: trade.exitPrice,
          pnl: trade.pnl,
          fees: trade.commission,
          reason: 'momentum_breakout'
        })),
        equityCurve: enhancedResult.equityCurve.map((point: any) => ({
          ts: new Date(point.timestamp).toISOString(),
          equity: point.equity
        })),
        summary: {
          trades: enhancedResult.totalTrades,
          wins: enhancedResult.trades.filter((t: any) => t.pnl > 0).length,
          losses: enhancedResult.trades.filter((t: any) => t.pnl <= 0).length,
          pnl: enhancedResult.totalPnl,
          fees: enhancedResult.totalCommissions,
          winRate: enhancedResult.metrics.winRate * 100,
          maxDd: enhancedResult.metrics.maxDrawdown,
          sharpe: enhancedResult.metrics.sharpeRatio,
          sortino: enhancedResult.metrics.sortinoRatio,
          profitFactor: enhancedResult.metrics.profitFactor,
          exposure: enhancedResult.metrics.timeInMarket,
          turnover: enhancedResult.metrics.turnover
        }
      };
      
      await writeResults(run.run_id, symbol, basicResult);
      break;
    }
    case 'momentum_breakout_v2': {
      // Use new professional trading engine with dynamic specs
      const strategyParams = {
        minRoc5m: run.params.minRoc5m || 1.2,
        minVolMult: run.params.minVolMult || 3,
        maxSpreadBps: run.params.maxSpreadBps || 10,
        leverage: executionParams.leverage,
        riskPct: 20, // Risk 20% of equity per trade
        rsiExitLevel: 75
      };
      
      const result = await runMomentumStrategy(
        candles, 
        strategyParams, 
        startingCapital, // Use user-specified starting capital
        exchangeSpecs, // Pass professional exchange specs if available
        symbol // Pass the actual symbol being backtested
      );
      await writeResults(run.run_id, symbol, result);
      break;
    }
    case 'regime_filtered_momentum': {
      // Convert 1m data to 15m for the strategy
      const timeframe = '15m';
      const aggregatedCandles = aggregateCandles(candles, timeframe);
      console.log(`Aggregated ${candles.length} 1m candles to ${aggregatedCandles.length} ${timeframe} candles for ${symbol}`);
      
      // Run multi-symbol engine with single symbol for advanced features
      const config = {
        symbols: [symbol],
        timeframe: timeframe as any,
        startDate: run.start_ts,
        endDate: run.end_ts,
        initialBalance: startingCapital,
        maxConcurrentPositions: run.params.maxConcurrentPositions || 3,
        
        // Enhanced backtest settings  
        warmupBars: 50,
        preventLookAhead: true,
        executeOnNextBar: false, // Use immediate execution for now to avoid timing issues
        slippageBps: executionParams.slippageBps,
        maxSpreadBps: run.params.maxSpreadBps || 6,
        fundingEnabled: true,
        seed: run.seed,
        strategyVersion: '1.0.0',
        riskFreeRate: 0.02
      };
      
      const engine = new MultiSymbolBacktestEngine(config);
      const strategy = createRegimeFilteredMomentumStrategy();
      
      // Override strategy params with user inputs
      (strategy as any).params = {
        ...(strategy as any).params,
        ...run.params  // User parameters override defaults
      };
      
      // Instead of using MultiSymbolEngine which tries to load professional data,
      // use the aggregated candles directly with the BacktestEngine
      const basicEngine = new (await import('./trading/BacktestEngine.js')).BacktestEngine({
        initialBalance: startingCapital,
        warmupBars: 0,
        preventLookAhead: true,
        fundingEnabled: true,
        slippageBps: executionParams.slippageBps,
        maxSpreadBps: run.params.maxSpreadBps || 6,
        executeOnNextBar: false,
        seed: run.seed,
        strategyVersion: '1.0.0',
        riskFreeRate: 0.02
      });
      
      // Create a simpler strategy function that works with the aggregated 15m data
      const simpleRegimeStrategy = (candle: any, index: number, state: any) => {
        const signals: any[] = [];
        
        if (index < 50) return signals; // Need warmup period
        
        // Basic regime filter - use EMA from features or calculate simple
        const ema200 = candle.ema_200 || candle.close; // Fallback if no EMA
        const roc1h = candle.roc_1h || 0;
        
        // Check regime conditions
        const inRegime = candle.close > ema200 && roc1h > 0;
        
        if (!inRegime) return signals;
        
        // Entry trigger conditions
        const roc15m = candle.roc_15m || 0;
        const volMult = candle.vol_mult || 1;
        const bbUpper = candle.bb_upper || candle.close * 1.02;
        
        if (candle.close > bbUpper && 
            volMult >= (run.params.minVolMult15m || 3) &&
            roc15m >= (run.params.minRoc15m || 0.006)) {
          
          const riskAmount = startingCapital * (run.params.riskPerTrade || 0.003);
          const size = riskAmount / candle.close;
          
          signals.push({
            symbol: symbol,
            side: 'LONG',
            size: size,
            type: 'MARKET',
            stopLoss: candle.close * 0.98,
            takeProfit: candle.close * 1.03,
            leverage: executionParams.leverage || 1
          });
        }
        
        return signals;
      };
      
      const enhancedResult = await basicEngine.runBacktest(
        aggregatedCandles,
        simpleRegimeStrategy,
        {
          runId: run.run_id,
          strategyName: 'regime_filtered_momentum',
          symbols: [symbol],
          params: run.params
        }
      );
      
      // Convert to expected format
      const results = {
        bySymbol: {
          [symbol]: {
            trades: enhancedResult.trades || [],
            equityCurve: enhancedResult.equityCurve || [],
            totalTrades: enhancedResult.totalTrades || 0,
            totalPnl: enhancedResult.totalPnl || 0,
            totalCommissions: enhancedResult.totalCommissions || 0,
            metrics: enhancedResult.metrics || {},
            liquidations: 0,
            totalFunding: 0
          }
        }
      };
      
      // Convert multi-symbol result to single symbol format for database
      const symbolResult = results.bySymbol[symbol];
      if (symbolResult) {
        const convertedResult = {
          trades: symbolResult.trades.map(trade => ({
            entryTs: trade.orderTime ? new Date(trade.orderTime).toISOString() : null,
            exitTs: trade.fillTime ? new Date(trade.fillTime).toISOString() : null,
            side: trade.side === 'BUY' ? 'LONG' : 'SHORT',
            qty: trade.filledQuantity,
            entryPx: trade.averageFillPrice,
            exitPx: trade.averageFillPrice,
            pnl: trade.position?.realizedPnl || 0,
            fees: trade.commission,
            reason: 'regime_filtered_momentum'
          })),
          equityCurve: symbolResult.equityCurve.map(point => ({
            ts: new Date(point.timestamp).toISOString(),
            equity: point.equity
          })),
          summary: {
            trades: symbolResult.totalTrades,
            wins: symbolResult.trades.filter(t => (t.position?.realizedPnl || 0) > 0).length,
            losses: symbolResult.trades.filter(t => (t.position?.realizedPnl || 0) <= 0).length,
            pnl: symbolResult.totalPnl,
            fees: symbolResult.totalCommissions,
            winRate: symbolResult.metrics.winRate * 100,
            maxDd: symbolResult.metrics.maxDrawdown,
            sharpe: symbolResult.metrics.sharpeRatio,
            sortino: symbolResult.metrics.sortinoRatio,
            profitFactor: symbolResult.metrics.profitFactor,
            exposure: symbolResult.metrics.timeInMarket,
            turnover: symbolResult.metrics.turnover,
            liquidations: symbolResult.liquidations,
            totalFunding: symbolResult.totalFunding
          }
        };
        
        await writeResults(run.run_id, symbol, convertedResult);
      } else {
        throw new Error(`No results for symbol ${symbol} in multi-symbol backtest`);
      }
      break;
    }
    default:
      throw new Error(`Unknown strategy ${run.strategy_name}`);
  }
}
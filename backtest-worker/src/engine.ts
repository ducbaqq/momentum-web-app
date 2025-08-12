import { loadCandlesWithFeatures, writeResults, validateDataQuality } from './db.js';
import type { RunRow } from './types.js';
import { runStrategy as momentumBreakout } from './strategies/momentumBreakout.js';
import { runMomentumStrategy } from './strategies/momentumBreakoutV2.js';
import { DataLoader } from './trading/DataLoader.js';

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
      const result = await momentumBreakout(symbol, candles, run.params, {
        ...executionParams,
        seed: run.seed
      }, startingCapital);
      await writeResults(run.run_id, symbol, result);
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
        exchangeSpecs // Pass professional exchange specs if available
      );
      await writeResults(run.run_id, symbol, result);
      break;
    }
    default:
      throw new Error(`Unknown strategy ${run.strategy_name}`);
  }
}
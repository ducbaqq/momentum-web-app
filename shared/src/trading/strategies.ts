import type { Candle, TradeSignal, StrategyState, StrategyRegistry } from '../types.js';
import { PositionSide, OrderType } from '../types.js';

// Helper function to get the appropriate ROC field based on timeframe
function getRocField(timeframe: string): string {
  switch (timeframe) {
    case '1m': return 'roc_1m';
    case '5m': return 'roc_5m';
    case '15m': return 'roc_15m';
    case '30m': return 'roc_30m';
    case '1h': return 'roc_1h';
    case '4h': return 'roc_4h';
    case '1d': return 'roc_4h'; // Use 4h as proxy for daily
    default: return 'roc_5m'; // Default fallback
  }
}

// Helper function to get ROC value from candle based on timeframe
function getRocValue(candle: Candle, timeframe: string): number {
  const rocField = getRocField(timeframe);
  return (candle as any)[rocField] ?? 0;
}

// Momentum Breakout V2 Strategy (Professional)
export function momentumBreakoutV2Strategy(
  candle: Candle,
  state: StrategyState,
  params: any
): TradeSignal[] {
  const signals: TradeSignal[] = [];

  // Get required parameters - OPTIMIZED DEFAULTS from hyperparameter optimization
  // Note: Parameters can be whole percentages (e.g., 30 for 30%) or decimals (e.g., 0.3 for 30%)
  // Convert whole percentages (> 1) to decimals, leave decimals (< 1) as-is for backward compatibility
  const minRocThreshold = params.minRoc5m !== undefined ? (params.minRoc5m > 1 ? params.minRoc5m / 100 : params.minRoc5m) : 0.306; // Convert whole % to decimal
  const minVolMult = params.minVolMult !== undefined ? params.minVolMult : 0.3; // Optimized: 0.3x volume multiplier
  const maxSpreadBps = params.maxSpreadBps !== undefined ? params.maxSpreadBps : 25; // Optimized: 25bps spread limit
  const leverage = params.leverage || 20; // Optimized: 20x leverage
  const riskPct = params.riskPct !== undefined ? (params.riskPct > 1 ? params.riskPct / 100 : params.riskPct) : 2.0; // Convert whole % to decimal
  const stopLossPct = params.stopLossPct !== undefined ? (params.stopLossPct > 1 ? params.stopLossPct / 100 : params.stopLossPct) : 0.029; // Convert whole % to decimal
  const takeProfitPct = params.takeProfitPct !== undefined ? (params.takeProfitPct > 1 ? params.takeProfitPct / 100 : params.takeProfitPct) : 0.025; // Convert whole % to decimal
  const rsiExitLevel = 75;
  const timeframe = state.timeframe || '5m'; // Default to 5m for backward compatibility

  // Validate required data is available
  const rocValue = getRocValue(candle, timeframe);
  const volMult = candle.vol_mult ?? 1;
  const spreadBps = candle.spread_bps ?? 0;

  const existingPosition = state.positions.find(p => p.symbol === state.symbol && p.status === 'open');

  if (existingPosition) {
    // Check exit conditions
    const momentumLost = (candle.roc_1m ?? 0) < 0;
    const rsiOverbought = (candle.rsi_14 ?? 50) > rsiExitLevel;

    if (momentumLost || rsiOverbought) {
      signals.push({
        symbol: state.symbol,
        side: existingPosition.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG,
        size: existingPosition.size,
        type: OrderType.MARKET,
        reason: momentumLost ? 'momentum_loss' : 'rsi_overbought',
        leverage
      });
    }
  } else {
    // Check entry conditions
    // ROC data is already in decimal format, use parameter directly
    const momentumOk = rocValue >= minRocThreshold;
    const volumeOk = volMult >= minVolMult;
    const spreadOk = spreadBps <= maxSpreadBps;

    if (momentumOk && volumeOk && spreadOk) {
      console.log(`[${state.symbol}] 🚀 ENTRY SIGNAL: roc_${timeframe}=${(rocValue * 100).toFixed(2)}% (>=${minRocThreshold}%), volMult=${volMult.toFixed(2)}x (>=${minVolMult}), spread=${spreadBps.toFixed(1)}bps (<=${maxSpreadBps})`);

      // Calculate position size based on risk percentage
      const riskAmount = state.currentCapital * (riskPct / 100);
      const positionNotional = riskAmount * leverage;
      const positionSize = positionNotional / candle.close;

      signals.push({
        symbol: state.symbol,
        side: PositionSide.LONG,
        size: positionSize,
        type: OrderType.MARKET,
        stopLoss: candle.close * (1.0 - stopLossPct), // Parameterized stop loss
        takeProfit: candle.close * (1.0 + takeProfitPct), // Parameterized take profit
        leverage,
        reason: `momentum_breakout_v2_${timeframe}`
      });
    }
  }

  return signals;
}

// Strategy registry
export const strategies: StrategyRegistry = {
  momentum_breakout_v2: momentumBreakoutV2Strategy,
};

// Strategy factory
export function getStrategy(strategyName: string): (candle: Candle, state: StrategyState, params: any) => TradeSignal[] {
  const strategy = strategies[strategyName];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${strategyName}. Available strategies: ${Object.keys(strategies).join(', ')}`);
  }
  return strategy;
}

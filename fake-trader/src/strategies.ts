import type { Candle, FakeTradeRun, FakePosition } from './types.js';

export interface TradeSignal {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  type: 'MARKET' | 'LIMIT';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  reason: string;
}

export interface StrategyState {
  runId: string;
  symbol: string;
  currentCapital: number;
  positions: FakePosition[];
  lastCandle?: Candle;
  timeframe?: string;
}

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
  
  // Get required parameters
  const minRocThreshold = params.minRoc5m !== undefined ? params.minRoc5m : 0.5; // Default to 0.5 (50%) instead of 1.2 (120%)
  const minVolMult = params.minVolMult !== undefined ? params.minVolMult : 2;
  const maxSpreadBps = params.maxSpreadBps !== undefined ? params.maxSpreadBps : 8;
  const leverage = params.leverage || 1;
  const riskPct = 20; // Risk 20% of equity per trade
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
        side: existingPosition.side === 'LONG' ? 'SHORT' : 'LONG',
        size: existingPosition.size,
        type: 'MARKET',
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
        side: 'LONG',
        size: positionSize,
        type: 'MARKET',
        stopLoss: candle.close * 0.98, // 2% stop loss
        takeProfit: candle.close * 1.03, // 3% take profit
        leverage,
        reason: `momentum_breakout_v2_${timeframe}`
      });
    }
  }
  
  return signals;
}



// Strategy factory
export function getStrategy(strategyName: string): (candle: Candle, state: StrategyState, params: any) => TradeSignal[] {
  switch (strategyName) {
    case 'momentum_breakout_v2':
      return momentumBreakoutV2Strategy;
    default:
      throw new Error(`Unknown strategy: ${strategyName}. Only momentum_breakout_v2 is supported.`);
  }
}
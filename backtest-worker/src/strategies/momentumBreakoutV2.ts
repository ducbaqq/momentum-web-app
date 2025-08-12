import { Engine, EngineConfig, TradeSignal, EngineState } from '../trading/Engine.js';
import { ExchangeSpec } from '../trading/ExchangeSpec.js';
import type { Candle } from '../types.js';
import type { ProfessionalCandle } from '../trading/DataLoader.js';

export interface MomentumParams {
  minRoc5m: number;        // Min 5-minute ROC (%)
  minVolMult: number;      // Min volume multiplier
  maxSpreadBps: number;    // Max spread in bps
  leverage: number;        // Position leverage
  riskPct: number;         // Risk percentage of equity per trade
  rsiExitLevel: number;    // RSI level for exits
}

export class MomentumBreakoutStrategy {
  private params: MomentumParams;
  private currentPosition: { symbol: string; side: 'LONG' | 'SHORT'; size: number } | null = null;

  constructor(params: MomentumParams) {
    this.params = params;
  }

  // Generate trading signals based on current candle and state
  generateSignals(candle: Candle | ProfessionalCandle, index: number, state: EngineState): TradeSignal[] {
    const signals: TradeSignal[] = [];
    
    // Skip first few bars to ensure we have previous data
    if (index < 2) return signals;

    // Get the symbol from candle (fallback to default)
    const symbol = this.getSymbolFromCandle(candle);
    
    // Check exit conditions first
    const exitSignal = this.checkExitConditions(candle, state);
    if (exitSignal) {
      signals.push(exitSignal);
      this.currentPosition = null;
      return signals;
    }

    // Check entry conditions if no position
    if (!this.currentPosition) {
      const entrySignal = this.checkEntryConditions(candle, state, symbol);
      if (entrySignal) {
        signals.push(entrySignal);
        this.currentPosition = {
          symbol,
          side: entrySignal.side,
          size: entrySignal.size
        };
      }
    }

    return signals;
  }

  private checkEntryConditions(candle: Candle, state: EngineState, symbol: string): TradeSignal | null {
    // Validate required data is available
    if (!candle.roc_5m || !candle.vol_mult || candle.spread_bps === null || candle.spread_bps === undefined) {
      return null;
    }

    // Check entry conditions
    const momentumOk = candle.roc_5m >= this.params.minRoc5m;
    const volumeOk = candle.vol_mult >= this.params.minVolMult;
    const spreadOk = candle.spread_bps <= this.params.maxSpreadBps;

    if (!momentumOk || !volumeOk || !spreadOk) {
      return null;
    }

    // Calculate position size based on risk percentage
    const riskAmount = state.totalEquity * (this.params.riskPct / 100);
    const positionNotional = riskAmount * this.params.leverage;
    const positionSize = positionNotional / candle.close;

    // Only go long for now (momentum breakout strategy)
    return {
      symbol,
      side: 'LONG',
      size: positionSize,
      leverage: this.params.leverage,
      type: 'MARKET'
    };
  }

  private checkExitConditions(candle: Candle, state: EngineState): TradeSignal | null {
    if (!this.currentPosition) return null;

    // Exit on momentum loss or RSI overbought
    const momentumLost = candle.roc_1m !== null && candle.roc_1m < 0;
    const rsiOverbought = candle.rsi_14 !== null && candle.rsi_14 > this.params.rsiExitLevel;

    if (momentumLost || rsiOverbought) {
      // Close entire position
      return {
        symbol: this.currentPosition.symbol,
        side: this.currentPosition.side === 'LONG' ? 'SHORT' : 'LONG',
        size: 0, // Close position
        type: 'MARKET'
      };
    }

    return null;
  }

  private getSymbolFromCandle(candle: Candle): string {
    // In practice, this would be passed or determined from context
    // For now, assume we're always trading the same symbol
    return 'BTCUSDT';
  }
}

// Updated strategy runner using new engine
export async function runMomentumStrategy(
  candles: Candle[],
  params: MomentumParams,
  initialBalance: number = 10000,
  exchangeSpecs?: Record<string, ExchangeSpec>
): Promise<any> {
  
  // Configure trading engine
  const engineConfig: EngineConfig = {
    initialBalance,
    exchangeSpecs, // Use dynamic specs if available
    positionMode: 'ONE_WAY',
    defaultLeverage: params.leverage
  };

  const engine = new Engine(engineConfig);
  const strategy = new MomentumBreakoutStrategy(params);

  // Run backtest
  const result = await engine.runBacktest(candles, (candle, index, state) => {
    return strategy.generateSignals(candle, index, state);
  });

  // Convert to expected format for compatibility
  return {
    trades: result.trades.map(trade => ({
      entryTs: trade.orderTime,
      exitTs: trade.fillTime,
      side: trade.side === 'BUY' ? 'LONG' : 'SHORT',
      qty: trade.filledQuantity,
      entryPx: trade.averageFillPrice,
      exitPx: trade.averageFillPrice, // Simplified
      pnl: result.totalPnl / (result.totalTrades || 1), // Rough approximation
      fees: trade.commission,
      reason: 'momentum_breakout'
    })),
    equityCurve: result.equityCurve.map(point => ({
      ts: new Date(point.timestamp).toISOString(),
      equity: point.equity
    })),
    summary: {
      trades: result.totalTrades,
      wins: result.trades.filter((t: any) => t.execution?.fillPrice > 0).length, // Simplified
      losses: result.trades.filter((t: any) => t.execution?.fillPrice <= 0).length,
      pnl: result.totalPnl,
      fees: result.totalCommissions,
      winRate: result.totalTrades > 0 ? (50) : 0, // Placeholder
      maxDd: result.maxDrawdown,
      sharpe: result.sharpeRatio,
      sortino: result.sharpeRatio, // Simplified
      profitFactor: result.totalPnl > 0 ? 2.0 : 0, // Placeholder
      exposure: 0.5, // Placeholder
      turnover: result.totalCommissions * 100, // Rough approximation
      liquidations: result.liquidations,
      totalFunding: result.totalFunding
    }
  };
}
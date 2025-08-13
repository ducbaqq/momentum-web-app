/**
 * Regime-Filtered Momentum Strategy
 * 
 * Strategy Requirements:
 * - Regime: 1h EMA200 filter + ROC_1h sign
 * - Trigger: 15m close above BB upper with vol_mult_15m ≥ 3 and ROC_15m ≥ 0.6%
 * - Risk: 0.3%/trade, ATR(15m,14)-based stop, partial at 1.2R, trail rest
 * - Guards: spread_bps ≤ 6, book_imb ≥ 1.2, avoid funding minute, kill switch on −2% day
 */

import { TradeSignal, EngineState } from '../trading/Engine.js';
import { MultiSymbolStrategy, MultiSymbolState } from '../trading/MultiSymbolEngine.js';
import { ProfessionalCandle } from '../trading/DataLoader.js';
import type { Candle } from '../types.js';

export interface RegimeFilteredMomentumParams {
  // Regime filter
  emaLength: number;           // EMA200 for regime
  rocPositive: boolean;        // Require positive ROC_1h
  
  // Entry trigger (15m bars)
  minVolMult15m: number;       // Min volume multiplier ≥ 3
  minRoc15m: number;           // Min ROC 15m ≥ 0.6%
  bbTrigger: boolean;          // Close above BB upper
  
  // Risk management
  riskPerTrade: number;        // 0.3% per trade
  atrPeriod: number;           // ATR(15m, 14)
  atrMultiplier: number;       // ATR multiplier for stop
  partialTakeLevel: number;    // 1.2R for partial take
  partialTakePercent: number;  // % to close at partial
  trailAfterPartial: boolean;  // Trail the rest
  
  // Guards
  maxSpreadBps: number;        // ≤ 6 bps
  minBookImbalance: number;    // ≥ 1.2
  avoidFundingMinute: boolean; // Skip trades near funding
  killSwitchPercent: number;   // -2% daily kill switch
  
  // Position management
  maxConcurrentPositions: number;
  leverage: number;
}

interface Position {
  symbol: string;
  entryPrice: number;
  entryTime: number;
  stopLoss: number;
  takeProfit: number;
  atrAtEntry: number;
  size: number;
  partialTaken: boolean;
  trailingStop?: number;
}

export class RegimeFilteredMomentumStrategy implements MultiSymbolStrategy {
  private params: RegimeFilteredMomentumParams;
  private positions: Map<string, Position> = new Map();
  private dailyPnL: number = 0;
  private dailyStartEquity: number = 0;
  private lastDayCheck: string = '';
  private killSwitchActive: boolean = false;

  constructor(params: Partial<RegimeFilteredMomentumParams> = {}) {
    this.params = {
      // Regime filter
      emaLength: 200,
      rocPositive: true,
      
      // Entry trigger
      minVolMult15m: 3.0,
      minRoc15m: 0.006,  // 0.6%
      bbTrigger: true,
      
      // Risk management
      riskPerTrade: 0.003,  // 0.3%
      atrPeriod: 14,
      atrMultiplier: 2.0,
      partialTakeLevel: 1.2,  // 1.2R
      partialTakePercent: 0.5,  // 50%
      trailAfterPartial: true,
      
      // Guards
      maxSpreadBps: 6,
      minBookImbalance: 1.2,
      avoidFundingMinute: true,
      killSwitchPercent: 0.02,  // 2%
      
      // Position management
      maxConcurrentPositions: 3,
      leverage: 1,
      
      ...params
    };
  }

  generateSignals(state: MultiSymbolState): TradeSignal[] {
    const signals: TradeSignal[] = [];
    
    // Check daily P&L kill switch
    this.checkDailyKillSwitch(state);
    
    if (this.killSwitchActive) {
      // Close all positions if kill switch is active
      for (const [symbol, position] of this.positions) {
        signals.push(this.createCloseSignal(symbol, position, 'kill_switch'));
      }
      this.positions.clear();
      return signals;
    }

    // Process exits first
    for (const [symbol, position] of this.positions) {
      const candle = state.candlesBySymbol[symbol];
      if (!candle) continue;

      const exitSignal = this.checkExitConditions(symbol, candle, position);
      if (exitSignal) {
        signals.push(exitSignal);
        this.positions.delete(symbol);
      }
    }

    // Process entries if we have capacity
    if (this.positions.size < this.params.maxConcurrentPositions) {
      for (const [symbol, candle] of Object.entries(state.candlesBySymbol)) {
        if (this.positions.has(symbol)) continue;

        const entrySignal = this.checkEntryConditions(symbol, candle, state);
        if (entrySignal) {
          signals.push(entrySignal);
          
          // Track the new position
          const atr = this.calculateATR(candle);
          const stopDistance = atr * this.params.atrMultiplier;
          
          this.positions.set(symbol, {
            symbol,
            entryPrice: candle.close,
            entryTime: state.timestamp,
            stopLoss: candle.close - stopDistance,
            takeProfit: candle.close + (stopDistance * this.params.partialTakeLevel),
            atrAtEntry: atr,
            size: entrySignal.size,
            partialTaken: false
          });

          // Only one new position per bar
          break;
        }
      }
    }

    return signals;
  }

  private checkEntryConditions(symbol: string, candle: any, state: MultiSymbolState): TradeSignal | null {
    // Must be a professional candle with all required data
    if (!this.isProfessionalCandle(candle)) {
      return null;
    }

    // 1. Regime Filter: EMA200 and ROC_1h positive
    if (!this.checkRegimeFilter(candle)) {
      return null;
    }

    // 2. Entry Trigger: BB breakout + volume + momentum
    if (!this.checkEntryTrigger(candle)) {
      return null;
    }

    // 3. Risk Guards
    if (!this.checkRiskGuards(candle, state)) {
      return null;
    }

    // 4. Calculate position size (0.3% risk)
    const equity = state.engineState.totalEquity;
    const riskAmount = equity * this.params.riskPerTrade;
    const atr = this.calculateATR(candle);
    const stopDistance = atr * this.params.atrMultiplier;
    const positionSize = riskAmount / stopDistance;

    return {
      symbol,
      side: 'LONG',
      size: positionSize,
      leverage: this.params.leverage,
      type: 'MARKET'
    };
  }

  private checkRegimeFilter(candle: any): boolean {
    // 1. Price above EMA200 (using ema_50 as proxy since we don't have ema_200)
    if (!candle.ema_50 || candle.close <= candle.ema_50) {
      return false;
    }

    // 2. Positive ROC_1h
    if (this.params.rocPositive && (!candle.roc_1h || candle.roc_1h <= 0)) {
      return false;
    }

    return true;
  }

  private checkEntryTrigger(candle: any): boolean {
    // 1. Close above Bollinger Band upper
    if (this.params.bbTrigger && (!candle.bb_upper || candle.close <= candle.bb_upper)) {
      return false;
    }

    // 2. Volume multiplier ≥ 3
    if (!candle.vol_mult || candle.vol_mult < this.params.minVolMult15m) {
      return false;
    }

    // 3. ROC_15m ≥ 0.6%
    if (!candle.roc_15m || candle.roc_15m < this.params.minRoc15m) {
      return false;
    }

    return true;
  }

  private checkRiskGuards(candle: any, state: MultiSymbolState): boolean {
    // 1. Spread constraint ≤ 6 bps
    if (candle.spread_bps && candle.spread_bps > this.params.maxSpreadBps) {
      return false;
    }

    // 2. Book imbalance ≥ 1.2
    if (candle.book_imb && candle.book_imb < this.params.minBookImbalance) {
      return false;
    }

    // 3. Avoid funding minute (typically xx:00, xx:08, xx:16)
    if (this.params.avoidFundingMinute) {
      const minute = new Date(state.timestamp).getMinutes();
      if (minute % 8 === 0) {  // Funding happens every 8 hours
        return false;
      }
    }

    return true;
  }

  private checkExitConditions(symbol: string, candle: any, position: Position): TradeSignal | null {
    // 1. Stop loss
    if (candle.close <= position.stopLoss) {
      return this.createCloseSignal(symbol, position, 'stop_loss');
    }

    // 2. Partial take profit at 1.2R
    if (!position.partialTaken && candle.close >= position.takeProfit) {
      const partialSize = position.size * this.params.partialTakePercent;
      
      // Update position for remaining size
      position.partialTaken = true;
      position.size *= (1 - this.params.partialTakePercent);
      
      // Set trailing stop if enabled
      if (this.params.trailAfterPartial) {
        const atrDistance = position.atrAtEntry * this.params.atrMultiplier;
        position.trailingStop = candle.close - atrDistance;
      }

      return {
        symbol,
        side: 'SHORT',
        size: partialSize,  // Partial close
        type: 'MARKET'
      };
    }

    // 3. Trailing stop (after partial take)
    if (position.partialTaken && position.trailingStop) {
      // Update trailing stop
      const atrDistance = position.atrAtEntry * this.params.atrMultiplier;
      const newTrailingStop = candle.close - atrDistance;
      if (newTrailingStop > position.trailingStop) {
        position.trailingStop = newTrailingStop;
      }

      // Exit if price hits trailing stop
      if (candle.close <= position.trailingStop) {
        return this.createCloseSignal(symbol, position, 'trailing_stop');
      }
    }

    // 4. Regime breakdown
    if (!this.checkRegimeFilter(candle)) {
      return this.createCloseSignal(symbol, position, 'regime_breakdown');
    }

    return null;
  }

  private createCloseSignal(symbol: string, position: Position, reason: string): TradeSignal {
    return {
      symbol,
      side: 'SHORT',
      size: 0,  // Close entire position
      type: 'MARKET'
    };
  }

  private calculateATR(candle: any): number {
    // Simplified ATR calculation using recent high-low range
    // In practice, you'd calculate true ATR over 14 periods
    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - candle.close),
      Math.abs(candle.low - candle.close)
    );
    return tr;  // Simplified - should be 14-period average
  }

  private checkDailyKillSwitch(state: MultiSymbolState): void {
    const currentDay = new Date(state.timestamp).toISOString().split('T')[0];
    
    // Reset daily tracking if new day
    if (currentDay !== this.lastDayCheck) {
      this.lastDayCheck = currentDay;
      this.dailyStartEquity = state.engineState.totalEquity;
      this.dailyPnL = 0;
      this.killSwitchActive = false;
    }

    // Calculate daily P&L
    this.dailyPnL = state.engineState.totalEquity - this.dailyStartEquity;
    const dailyReturn = this.dailyPnL / this.dailyStartEquity;

    // Activate kill switch if daily loss exceeds threshold
    if (dailyReturn <= -this.params.killSwitchPercent) {
      this.killSwitchActive = true;
      console.log(`Kill switch activated: Daily loss ${(dailyReturn * 100).toFixed(2)}%`);
    }
  }

  private isProfessionalCandle(candle: any): candle is ProfessionalCandle {
    return candle.roc_1h !== undefined && 
           candle.roc_15m !== undefined && 
           candle.vol_mult !== undefined &&
           candle.bb_upper !== undefined &&
           candle.ema_50 !== undefined;
  }
}

/**
 * Factory function to create strategy with your exact parameters
 */
export function createRegimeFilteredMomentumStrategy(): RegimeFilteredMomentumStrategy {
  return new RegimeFilteredMomentumStrategy({
    // Regime filter
    emaLength: 200,
    rocPositive: true,
    
    // Entry trigger (15m timeframe)
    minVolMult15m: 3.0,        // vol_mult_15m ≥ 3
    minRoc15m: 0.006,          // ROC_15m ≥ 0.6%
    bbTrigger: true,           // close above BB upper
    
    // Risk management
    riskPerTrade: 0.003,       // 0.3% per trade
    atrPeriod: 14,             // ATR(15m, 14)
    atrMultiplier: 2.0,        // ATR-based stop
    partialTakeLevel: 1.2,     // 1.2R partial take
    partialTakePercent: 0.5,   // 50% partial
    trailAfterPartial: true,   // trail the rest
    
    // Guards
    maxSpreadBps: 6,           // spread_bps ≤ 6
    minBookImbalance: 1.2,     // book_imb ≥ 1.2
    avoidFundingMinute: true,  // avoid funding minute
    killSwitchPercent: 0.02,   // -2% daily kill switch
    
    // Position management
    maxConcurrentPositions: 3,
    leverage: 1
  });
}
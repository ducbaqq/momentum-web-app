import type { Candle, RealPosition } from './types.js';
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
    positions: RealPosition[];
    lastCandle?: Candle;
}
export declare function momentumBreakoutStrategy(candle: Candle, state: StrategyState, params: any): TradeSignal[];
export declare function momentumBreakoutV2Strategy(candle: Candle, state: StrategyState, params: any): TradeSignal[];
export declare function regimeFilteredMomentumStrategy(candle: Candle, state: StrategyState, params: any): TradeSignal[];
export declare function getStrategy(strategyName: string): (candle: Candle, state: StrategyState, params: any) => TradeSignal[];

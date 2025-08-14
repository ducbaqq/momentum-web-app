import type { Candle } from './types.js';

export const bps = (x: number) => x / 10000;
export function sharpe(returns: number[]): number {
  if (!returns.length) return 0;
  const m = returns.reduce((a,b)=>a+b,0)/returns.length;
  const v = returns.reduce((a,b)=>a+(b-m)*(b-m),0)/returns.length;
  const sd = Math.sqrt(v || 1e-9);
  return m / (sd || 1e-9) * Math.sqrt(365*24*60); // 1m bars -> annualize
}
export function maxDrawdown(equity: number[]): number {
  let peak = equity[0] || 0, maxDd = 0;
  for (const v of equity) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, (v-peak)/peak); }
  return Math.abs(maxDd*100);
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface TimeframeConfig {
  minutes: number;
  label: string;
}

export const TIMEFRAME_CONFIGS: Record<Timeframe, TimeframeConfig> = {
  '1m': { minutes: 1, label: '1 minute' },
  '5m': { minutes: 5, label: '5 minutes' },
  '15m': { minutes: 15, label: '15 minutes' },
  '30m': { minutes: 30, label: '30 minutes' },
  '1h': { minutes: 60, label: '1 hour' },
  '4h': { minutes: 240, label: '4 hours' },
  '1d': { minutes: 1440, label: '1 day' }
};

export function aggregateCandles(candles: Candle[], targetTimeframe: Timeframe): Candle[] {
  if (targetTimeframe === '1m') {
    return candles; // No aggregation needed
  }

  const config = TIMEFRAME_CONFIGS[targetTimeframe];
  if (!config) {
    throw new Error(`Unsupported timeframe: ${targetTimeframe}`);
  }

  const aggregated: Candle[] = [];
  const intervalMs = config.minutes * 60 * 1000;

  // Group candles by timeframe intervals
  const groups = new Map<number, Candle[]>();
  
  for (const candle of candles) {
    const timestamp = new Date(candle.ts).getTime();
    const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs;
    
    if (!groups.has(intervalStart)) {
      groups.set(intervalStart, []);
    }
    groups.get(intervalStart)!.push(candle);
  }

  // Aggregate each group
  for (const [intervalStart, groupCandles] of groups) {
    if (groupCandles.length === 0) continue;

    // Sort by timestamp
    groupCandles.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    const first = groupCandles[0];
    const last = groupCandles[groupCandles.length - 1];

    // Calculate OHLCV
    const open = first.open;
    const close = last.close;
    const high = Math.max(...groupCandles.map(c => c.high));
    const low = Math.min(...groupCandles.map(c => c.low));
    const volume = groupCandles.reduce((sum, c) => sum + c.volume, 0);

    // For technical indicators, use the last available values
    const aggregatedCandle: Candle = {
      ts: new Date(intervalStart).toISOString(),
      open,
      high,
      low,
      close,
      volume,
      trades_count: groupCandles.reduce((sum, c) => sum + (c.trades_count || 0), 0),
      vwap_minute: last.vwap_minute, // Use last VWAP
      
      // Technical indicators from last candle
      roc_1m: last.roc_1m,
      roc_5m: last.roc_5m,
      roc_15m: last.roc_15m,
      roc_30m: last.roc_30m,
      roc_1h: last.roc_1h,
      roc_4h: last.roc_4h,
      rsi_14: last.rsi_14,
      ema_12: last.ema_12,
      ema_20: last.ema_20,
      ema_26: last.ema_26,
      ema_50: last.ema_50,
      macd: last.macd,
      macd_signal: last.macd_signal,
      bb_upper: last.bb_upper,
      bb_lower: last.bb_lower,
      bb_basis: last.bb_basis,
      vol_avg_20: last.vol_avg_20,
      vol_mult: last.vol_mult,
      book_imb: last.book_imb,
      spread_bps: last.spread_bps,
      
      // Professional fields (if present in source)
      symbol: (first as any).symbol,
      // Keep only fields that exist on Candle's extended types
      // @ts-expect-error: Optional passthrough when present
      markPrice: (last as any).markPrice,
      // @ts-ignore
      fundingRate: (last as any).fundingRate,
      // @ts-ignore
      openInterest: (last as any).openInterest,
      // @ts-ignore
      l1Snapshot: (last as any).l1Snapshot
    };

    aggregated.push(aggregatedCandle);
  }

  return aggregated.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

export function validateTimeframe(timeframe: string): timeframe is Timeframe {
  return timeframe in TIMEFRAME_CONFIGS;
}

export function getTimeframeMinutes(timeframe: Timeframe): number {
  return TIMEFRAME_CONFIGS[timeframe].minutes;
}
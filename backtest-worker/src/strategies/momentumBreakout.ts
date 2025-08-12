import type { Candle, StrategyContext, RunResult, Trade } from '../types.js';
import { bps, maxDrawdown, sharpe } from '../utils.js';

type Params = {
  minRoc5m: number;  // e.g., 1.2 (%)
  minVolMult: number; // e.g., 3
  maxSpreadBps: number; // e.g., 10
};

export async function runStrategy(
  symbol: string,
  candles: Candle[],
  params: Params,
  ctx: StrategyContext,
  startingCapital: number = 10000
): Promise<RunResult> {
  let equity = startingCapital;
  let position: Trade | null = null;
  const trades: Trade[] = [];
  const curve: { ts: string; equity: number }[] = [];
  const perBarReturns: number[] = [];
  let feesAcc = 0, turnover = 0, wins=0, losses=0;

  // Initialize equity curve with first bar
  if (candles.length > 0) {
    curve.push({ ts: candles[0].ts, equity });
  }

  // Start from i=1 since we need cPrev (previous bar) for signal generation
  for (let i = 1; i < candles.length; i++) {
    const cPrev = candles[i-1];
    const c = candles[i];
    // Realistic execution: signals based on PREVIOUS bar, execution at CURRENT bar open
    const openPx = c.open;
    const closePx = c.close;

    // Exit rules - use PREVIOUS bar data to generate exit signals
    if (position) {
      // Exit based on PREVIOUS bar's indicators (no lookahead bias)
      // Only consider exit if we have the required indicator data
      const shouldExit = (cPrev.roc_1m !== null && cPrev.roc_1m < 0) || 
                        (cPrev.rsi_14 !== null && cPrev.rsi_14 > 75);
      
      if (shouldExit) {
        position.exitPx = openPx * (1 - bps(ctx.slippageBps));
        position.exitTs = c.ts;
        const gross = (position.side === 'LONG')
          ? (position.exitPx - position.entryPx) * position.qty
          : (position.entryPx - position.exitPx) * position.qty;
        const fees = (position.entryPx + (position.exitPx ?? position.entryPx)) * position.qty * bps(ctx.feeBps);
        feesAcc += fees;
        const pnl = gross - fees;
        position.pnl = pnl; position.fees = fees;
        trades.push(position);
        wins += pnl > 0 ? 1 : 0;
        losses += pnl <= 0 ? 1 : 0;
        equity += pnl;
        position = null;
      }
    }

    // Entry rules - use PREVIOUS bar data to generate entry signals (no lookahead bias)
    // Only trade if we have all required indicator data from previous bar
    if (cPrev.spread_bps === null || cPrev.vol_mult === null || cPrev.roc_5m === null) {
      // Skip this bar if indicators are missing
      continue;
    }

    const spreadOk = cPrev.spread_bps <= params.maxSpreadBps;
    const volOk = cPrev.vol_mult >= params.minVolMult;
    const momentumOk = cPrev.roc_5m >= params.minRoc5m;

    if (!position && spreadOk && volOk && momentumOk) {
      const notional = equity * 0.2 * ctx.leverage; // risk 20% notional * lev
      const px = openPx * (1 + bps(ctx.slippageBps)); // Execute at current bar open + slippage
      const qty = notional / px;
      const fees = px * qty * bps(ctx.feeBps);
      feesAcc += fees;
      turnover += notional;
      position = { entryTs: c.ts, side: 'LONG', qty, entryPx: px, reason: 'breakout' };
    }

    // Mark-to-market (simplified)
    const mtm = position
      ? ((closePx - (position.entryPx)) * position.qty)
      : 0;
    const eq = equity + mtm;
    curve.push({ ts: c.ts, equity: eq });
    
    // Calculate returns based on equity curve length (not loop index)
    if (curve.length > 1) {
      const prevEq = curve[curve.length - 2].equity;
      perBarReturns.push((eq - prevEq) / prevEq);
    }
  }

  const pnl = equity - startingCapital;
  const maxDd = maxDrawdown(curve.map(p => p.equity));
  const sh = sharpe(perBarReturns);
  const profitFactor = (() => {
    let gp=0, gl=0;
    for (const t of trades) (t.pnl! >= 0 ? gp : gl += -t.pnl! );
    return gl === 0 ? (gp>0?Infinity:0) : gp/gl;
  })();

  return {
    trades,
    equityCurve: curve,
    summary: {
      trades: trades.length, wins, losses,
      pnl, fees: feesAcc,
      winRate: trades.length ? (wins / trades.length) * 100 : 0,
      maxDd, sharpe: sh, sortino: sh, profitFactor,
      exposure: 0, turnover
    }
  };
}
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
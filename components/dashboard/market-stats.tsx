'use client';

import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';

type LatestTick = {
  symbol: string;
  ts: string;
  close: string;
  roc1m: string | null;
  roc5m: string | null;
  vol: string | null;
  vol_avg: string | null;
  book_imb: string | null;
  signal?: boolean | null;
};

interface MarketStatsProps {
  latest: LatestTick[];
  symbols: string[];
}

export function MarketStats({ latest, symbols }: MarketStatsProps) {
  // Calculate market statistics
  const totalSymbols = symbols.length;
  const activeSignals = latest.filter(tick => tick.signal).length;

  const avgRoc1m = latest
    .map(tick => tick.roc1m ? parseFloat(tick.roc1m) : 0)
    .filter(val => !isNaN(val))
    .reduce((sum, val, _, arr) => sum + val / arr.length, 0);

  const positiveMomentum = latest.filter(tick =>
    tick.roc1m && parseFloat(tick.roc1m) > 0
  ).length;

  const stats = [
    {
      label: 'Total Symbols',
      value: totalSymbols.toString(),
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Active Signals',
      value: activeSignals.toString(),
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Avg 1m ROC',
      value: `${avgRoc1m.toFixed(2)}%`,
      icon: avgRoc1m >= 0 ? TrendingUp : TrendingDown,
      color: avgRoc1m >= 0 ? 'text-profit' : 'text-loss',
      bgColor: avgRoc1m >= 0 ? 'bg-profit/10' : 'bg-loss/10',
    },
    {
      label: 'Bullish Momentum',
      value: `${positiveMomentum}/${totalSymbols}`,
      icon: DollarSign,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <div key={index} className="card card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground-muted font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
            </div>
            <div className={`p-3 rounded-xl ${stat.bgColor}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

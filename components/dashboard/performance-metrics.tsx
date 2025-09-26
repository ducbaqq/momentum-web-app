'use client';

import { TrendingUp, TrendingDown, BarChart3, Target } from 'lucide-react';

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

interface PerformanceMetricsProps {
  latest: LatestTick[];
}

export function PerformanceMetrics({ latest }: PerformanceMetricsProps) {
  // Calculate performance metrics
  const roc1mValues = latest
    .map(tick => tick.roc1m ? parseFloat(tick.roc1m) : null)
    .filter(val => val !== null) as number[];

  const roc5mValues = latest
    .map(tick => tick.roc5m ? parseFloat(tick.roc5m) : null)
    .filter(val => val !== null) as number[];

  const avgRoc1m = roc1mValues.length > 0
    ? roc1mValues.reduce((sum, val) => sum + val, 0) / roc1mValues.length
    : 0;

  const avgRoc5m = roc5mValues.length > 0
    ? roc5mValues.reduce((sum, val) => sum + val, 0) / roc5mValues.length
    : 0;

  const bullishCount = roc1mValues.filter(val => val > 0).length;
  const bearishCount = roc1mValues.filter(val => val < 0).length;

  const volatility = roc1mValues.length > 0
    ? Math.sqrt(roc1mValues.reduce((sum, val) => sum + Math.pow(val - avgRoc1m, 2), 0) / roc1mValues.length)
    : 0;

  const maxGain = roc1mValues.length > 0 ? Math.max(...roc1mValues) : 0;
  const maxLoss = roc1mValues.length > 0 ? Math.min(...roc1mValues) : 0;

  const metrics = [
    {
      label: 'Average 1m ROC',
      value: `${avgRoc1m.toFixed(2)}%`,
      icon: avgRoc1m >= 0 ? TrendingUp : TrendingDown,
      color: avgRoc1m >= 0 ? 'text-profit' : 'text-loss',
      bgColor: avgRoc1m >= 0 ? 'bg-profit/10' : 'bg-loss/10',
    },
    {
      label: 'Average 5m ROC',
      value: `${avgRoc5m.toFixed(2)}%`,
      icon: avgRoc5m >= 0 ? TrendingUp : TrendingDown,
      color: avgRoc5m >= 0 ? 'text-profit' : 'text-loss',
      bgColor: avgRoc5m >= 0 ? 'bg-profit/10' : 'bg-loss/10',
    },
    {
      label: 'Bullish vs Bearish',
      value: `${bullishCount} / ${bearishCount}`,
      icon: BarChart3,
      color: bullishCount > bearishCount ? 'text-profit' : 'text-loss',
      bgColor: bullishCount > bearishCount ? 'bg-profit/10' : 'bg-loss/10',
    },
    {
      label: 'Market Volatility',
      value: `${volatility.toFixed(2)}%`,
      icon: Target,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-foreground mb-6">Performance Metrics</h2>

      <div className="space-y-6">
        {/* Main Metrics */}
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((metric, index) => (
            <div key={index} className="text-center">
              <div className={`inline-flex p-3 rounded-xl mb-2 ${metric.bgColor}`}>
                <metric.icon className={`w-6 h-6 ${metric.color}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">{metric.value}</div>
              <div className="text-sm text-foreground-muted">{metric.label}</div>
            </div>
          ))}
        </div>

        {/* Range Indicators */}
        <div className="border-t border-card-border pt-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Price Action Range</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-sm text-foreground-muted mb-1">Max Gain (1m)</div>
              <div className="text-xl font-bold text-profit">+{maxGain.toFixed(2)}%</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-foreground-muted mb-1">Max Loss (1m)</div>
              <div className="text-xl font-bold text-loss">{maxLoss.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {/* Market Sentiment */}
        <div className="border-t border-card-border pt-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Market Sentiment</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Bullish Momentum</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full bg-profit rounded-full"
                    style={{ width: `${(bullishCount / (bullishCount + bearishCount)) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-foreground w-12 text-right">
                  {bullishCount + bearishCount > 0 ? Math.round((bullishCount / (bullishCount + bearishCount)) * 100) : 0}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Bearish Momentum</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full bg-loss rounded-full"
                    style={{ width: `${(bearishCount / (bullishCount + bearishCount)) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-foreground w-12 text-right">
                  {bullishCount + bearishCount > 0 ? Math.round((bearishCount / (bullishCount + bearishCount)) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

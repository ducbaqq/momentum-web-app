'use client';

import { Clock, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

type Signal = {
  ts: string;
  symbol: string;
  close: string;
  roc1m: string;
  roc5m: string;
  vol: string;
  vol_avg: string;
  book_imb: string;
  thresholds: Record<string, unknown> | null;
};

interface RecentSignalsProps {
  signals: Record<string, Signal | null>;
  symbols: string[];
}

export function RecentSignals({ signals, symbols }: RecentSignalsProps) {
  // Get recent signals (within last hour)
  const recentSignals = Object.entries(signals)
    .filter(([_, signal]) => {
      if (!signal) return false;
      const signalTime = new Date(signal.ts).getTime();
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      return signalTime > oneHourAgo;
    })
    .map(([symbol, signal]) => ({ symbol, signal: signal! }))
    .sort((a, b) => new Date(b.signal.ts).getTime() - new Date(a.signal.ts).getTime())
    .slice(0, 10);

  if (recentSignals.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold text-foreground mb-6">Recent Signals</h2>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
          <p className="text-foreground-muted">No recent signals in the last hour</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-foreground mb-6">Recent Signals</h2>

      <div className="space-y-4">
        {recentSignals.map(({ symbol, signal }) => {
          const roc1m = parseFloat(signal.roc1m);
          const roc5m = parseFloat(signal.roc5m);
          const price = parseFloat(signal.close);
          const volume = parseFloat(signal.vol);
          const volMult = parseFloat(signal.vol_avg) > 0 ? volume / parseFloat(signal.vol_avg) : 1;

          return (
            <div key={`${symbol}-${signal.ts}`} className="p-4 rounded-lg bg-card-hover border border-card-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <a
                    href={`https://www.binance.com/en/futures/${symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-2"
                  >
                    {symbol.replace('USDT', '')}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="status-badge status-success">
                    <TrendingUp className="w-3 h-3" />
                    Signal
                  </div>
                </div>
                <div className="text-sm text-foreground-muted">
                  {new Date(signal.ts).toLocaleTimeString()}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-foreground-muted mb-1">Price</div>
                  <div className="font-medium text-foreground">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </div>
                </div>

                <div>
                  <div className="text-foreground-muted mb-1">1m ROC</div>
                  <div className={`font-medium flex items-center gap-1 ${
                    roc1m >= 0 ? 'text-profit' : 'text-loss'
                  }`}>
                    {roc1m >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {roc1m.toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div className="text-foreground-muted mb-1">5m ROC</div>
                  <div className={`font-medium flex items-center gap-1 ${
                    roc5m >= 0 ? 'text-profit' : 'text-loss'
                  }`}>
                    {roc5m >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {roc5m.toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div className="text-foreground-muted mb-1">Volume ×</div>
                  <div className="font-medium text-foreground">
                    {volMult.toFixed(1)}×
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

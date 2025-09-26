'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, Settings, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SymbolCardSkeleton } from './symbol-card-skeleton';

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

interface MarketOverviewProps {
  latest: LatestTick[];
  signals: Record<string, Signal | null>;
  symbols: string[];
  isLoading?: boolean;
}

export function MarketOverview({ latest, signals, symbols, isLoading = false }: MarketOverviewProps) {
  const [sortBy, setSortBy] = useState<'symbol' | 'price' | 'roc1m' | 'signal'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sort symbols based on current criteria
  const sortedSymbols = [...symbols].sort((a, b) => {
    const aData = latest.find(tick => tick.symbol === a);
    const bData = latest.find(tick => tick.symbol === b);

    let aValue: any = a;
    let bValue: any = b;

    switch (sortBy) {
      case 'price':
        aValue = aData ? parseFloat(aData.close) : 0;
        bValue = bData ? parseFloat(bData.close) : 0;
        break;
      case 'roc1m':
        aValue = aData?.roc1m ? parseFloat(aData.roc1m) : 0;
        bValue = bData?.roc1m ? parseFloat(bData.roc1m) : 0;
        break;
      case 'signal':
        aValue = signals[a] ? 1 : 0;
        bValue = signals[b] ? 1 : 0;
        break;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Market Overview</h2>
        <div className="flex items-center gap-2">
          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('_');
              setSortBy(field as any);
              setSortOrder(order as any);
            }}
            className="text-sm bg-input border border-input-border rounded-lg px-3 py-1 focus:border-input-focus"
          >
            <option value="symbol_asc">Symbol A-Z</option>
            <option value="symbol_desc">Symbol Z-A</option>
            <option value="price_desc">Price High-Low</option>
            <option value="price_asc">Price Low-High</option>
            <option value="roc1m_desc">ROC High-Low</option>
            <option value="roc1m_asc">ROC Low-High</option>
            <option value="signal_desc">Signals First</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [...Array(12)].map((_, i) => <SymbolCardSkeleton key={`skeleton-${i}`} />)
          : sortedSymbols.slice(0, 12).map((symbol) => {
          const data = latest.find(tick => tick.symbol === symbol);
          const signal = signals[symbol];
          const price = data ? parseFloat(data.close) : null;
          const roc1m = data?.roc1m ? parseFloat(data.roc1m) : null;
          const roc5m = data?.roc5m ? parseFloat(data.roc5m) : null;
          const roc5mNum = roc5m !== null ? roc5m : null;

          return (
            <div
              key={symbol}
              className={`p-4 rounded-lg border transition-all duration-200 ${
                signal
                  ? 'border-success/50 bg-success/5 ring-1 ring-success/20'
                  : 'border-card-border bg-card-hover'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <a
                  href={`https://www.binance.com/en/futures/${symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-2"
                >
                  {symbol.replace('USDT', '')}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {signal && (
                  <div className="status-badge status-success">
                    <Activity className="w-3 h-3" />
                    Signal
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-2xl font-bold text-foreground">
                  ${price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">1m ROC</span>
                  {roc1m !== null ? (
                    <div className={`flex items-center gap-1 font-medium ${
                      roc1m >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {roc1m >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {roc1m.toFixed(2)}%
                    </div>
                  ) : (
                    <span className="text-foreground-muted">—</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">5m ROC</span>
                  {roc5mNum !== null ? (
                    <div className={`flex items-center gap-1 font-medium ${
                      roc5mNum >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {roc5mNum >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {roc5mNum.toFixed(2)}%
                    </div>
                  ) : (
                    <span className="text-foreground-muted">—</span>
                  )}
                </div>

                {signal && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-foreground-muted">
                      Signal: {new Date(signal.ts).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {symbols.length > 12 && (
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm">
            View All {symbols.length} Symbols
          </Button>
        </div>
      )}
    </div>
  );
}

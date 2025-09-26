'use client';

import { TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';

export function ActivePositions() {
  // Mock data for active positions (in a real app, this would come from an API)
  const activePositions = [
    {
      symbol: 'BTCUSDT',
      side: 'LONG',
      size: 0.001,
      entryPrice: 45000,
      currentPrice: 45200,
      unrealizedPnl: 20,
      leverage: 10,
      openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      symbol: 'ETHUSDT',
      side: 'SHORT',
      size: 0.1,
      entryPrice: 2500,
      currentPrice: 2480,
      unrealizedPnl: 20,
      leverage: 5,
      openedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    },
  ];

  const formatDuration = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else {
      return `${diffMinutes}m`;
    }
  };

  if (activePositions.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold text-foreground mb-6">Active Positions</h2>
        <div className="text-center py-8">
          <DollarSign className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
          <p className="text-foreground-muted">No active positions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-foreground mb-6">Active Positions</h2>

      <div className="space-y-4">
        {activePositions.map((position, index) => {
          const pnlPercentage = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100 * (position.side === 'LONG' ? 1 : -1);
          const isProfit = pnlPercentage >= 0;

          return (
            <div key={index} className="p-4 rounded-lg bg-card-hover border border-card-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`status-badge ${position.side === 'LONG' ? 'status-success' : 'status-error'}`}>
                    {position.side}
                  </div>
                  <span className="font-semibold text-foreground">
                    {position.symbol.replace('USDT', '')}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {position.leverage}x leverage
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <Clock className="w-4 h-4" />
                  {formatDuration(position.openedAt)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-foreground-muted mb-1">Size</div>
                  <div className="font-medium text-foreground">
                    {position.size} {position.symbol.replace('USDT', '')}
                  </div>
                </div>

                <div>
                  <div className="text-foreground-muted mb-1">Entry Price</div>
                  <div className="font-medium text-foreground">
                    ${position.entryPrice.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-foreground-muted mb-1">Current Price</div>
                  <div className="font-medium text-foreground">
                    ${position.currentPrice.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-card-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground-muted">Unrealized P&L</span>
                    <div className={`flex items-center gap-1 font-medium ${
                      isProfit ? 'text-profit' : 'text-loss'
                    }`}>
                      {isProfit ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      ${position.unrealizedPnl.toFixed(2)} ({pnlPercentage.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activePositions.length > 0 && (
        <div className="mt-6 pt-4 border-t border-card-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-muted">Total Unrealized P&L</span>
            <span className="font-medium text-profit">
              +${activePositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

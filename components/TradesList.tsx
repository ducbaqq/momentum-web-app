'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { formatLocalDateTime } from '@/lib/dateUtils';

type Trade = {
  run_id: string;
  symbol: string;
  entry_ts: string;
  exit_ts: string | null;
  side: 'long' | 'short';
  qty: number;
  entry_px: number;
  exit_px: number | null;
  pnl: number;
  fees: number;
  reason: string;
};

interface TradesListProps {
  runId: string;
  className?: string;
  selectedSymbol?: string | null;
}

export default function TradesList({ runId, className, selectedSymbol }: TradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    async function fetchTrades() {
      try {
        setLoading(true);
        const response = await fetch(`/api/backtest/trades/${runId}`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Set real trades data (empty array if no trades)
        const allTrades = data.trades || [];
        // Filter trades by selected symbol if provided
        const filteredTrades = selectedSymbol 
          ? allTrades.filter((trade: Trade) => trade.symbol === selectedSymbol)
          : allTrades;
        setTrades(filteredTrades);
      } catch (e: any) {
        console.error('Failed to fetch trades:', e);
        setError(e.message);
        setTrades([]);
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      fetchTrades();
    }
  }, [runId, selectedSymbol]);

  const formatPrice = (price: number | null): string => {
    if (price == null) return '--';
    return price.toFixed(4);
  };

  const formatQuantity = (qty: number): string => {
    return qty.toLocaleString();
  };

  const formatPnL = (pnl: number): string => {
    if (pnl === 0) return '$0.00';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  };

  const formatTradeTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}, ${month}, ${hours}:${minutes}`;
  };

  const getPnLColor = (pnl: number): string => {
    if (pnl > 0) return 'text-green-400';
    if (pnl < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getTradeStatus = (trade: Trade): { status: string; color: string } => {
    if (trade.exit_ts) {
      return { 
        status: 'FILLED', 
        color: trade.pnl >= 0 ? 'text-green-400' : 'text-red-400' 
      };
    }
    return { status: 'OPEN', color: 'text-yellow-400' };
  };

  if (loading) {
    return (
      <div className={clsx("rounded-xl border border-border bg-card p-6", className)}>
        <h2 className="text-2xl font-bold mb-6">📋 Trade History</h2>
        <div className="text-center py-12 text-sub">
          Loading trades...
        </div>
      </div>
    );
  }

  if (error && trades.length === 0) {
    return (
      <div className={clsx("rounded-xl border border-border bg-card p-6", className)}>
        <h2 className="text-2xl font-bold mb-6">📋 Trade History</h2>
        <div className="text-center py-12">
          <p className="text-red-400 mb-2">Error loading trades</p>
          <p className="text-sm text-sub">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-xl border border-border bg-card p-6", className)}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">📋 Trade History</h2>
        <div className="text-sm text-sub">
          {trades.length} {trades.length === 1 ? 'trade' : 'trades'}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-12 text-sub">
          <p className="text-lg mb-2">No trades executed</p>
          <p className="text-sm">This backtest did not generate any trades.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-sub uppercase tracking-wider border-b border-border">
            <div className="col-span-2">Entry Time</div>
            <div className="col-span-1">Symbol</div>
            <div className="col-span-1">Side</div>
            <div className="col-span-1">Qty</div>
            <div className="col-span-1">Entry Price</div>
            <div className="col-span-1">Exit Price</div>
            <div className="col-span-1">PnL</div>
            <div className="col-span-1">Fees</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Exit Time</div>
          </div>

          {/* Trades */}
          <div className="space-y-1">
            {trades.map((trade, index) => {
              const tradeStatus = getTradeStatus(trade);
              const duration = trade.exit_ts 
                ? Math.round((new Date(trade.exit_ts).getTime() - new Date(trade.entry_ts).getTime()) / (1000 * 60))
                : null;

              return (
                <div 
                  key={index}
                  className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-bg/50 transition-colors"
                >
                  {/* Entry Time */}
                  <div className="col-span-2 font-mono text-xs">
                    {formatTradeTime(trade.entry_ts)}
                  </div>

                  {/* Symbol */}
                  <div className="col-span-1 font-medium">
                    {trade.symbol}
                  </div>

                  {/* Side */}
                  <div className={clsx("col-span-1 font-medium uppercase", 
                    trade.side === 'long' ? 'text-green-400' : 'text-red-400'
                  )}>
                    {trade.side}
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1 font-mono">
                    {formatQuantity(trade.qty)}
                  </div>

                  {/* Entry Price */}
                  <div className="col-span-1 font-mono">
                    ${formatPrice(trade.entry_px)}
                  </div>

                  {/* Exit Price */}
                  <div className="col-span-1 font-mono">
                    ${formatPrice(trade.exit_px)}
                  </div>

                  {/* PnL */}
                  <div className={clsx("col-span-1 font-mono font-medium", getPnLColor(trade.pnl))}>
                    {formatPnL(trade.pnl)}
                  </div>

                  {/* Fees */}
                  <div className="col-span-1 font-mono text-sub">
                    ${trade.fees.toFixed(2)}
                  </div>

                  {/* Status */}
                  <div className={clsx("col-span-1 text-xs font-medium", tradeStatus.color)}>
                    {tradeStatus.status}
                  </div>

                  {/* Exit Time */}
                  <div className="col-span-2 font-mono text-xs">
                    {trade.exit_ts ? formatTradeTime(trade.exit_ts) : (
                      <span className="text-yellow-400">Open</span>
                    )}
                    {duration && (
                      <div className="text-xs text-sub/70 mt-1">
                        {duration}m • {trade.reason.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {trades.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-sub">Total Trades</div>
              <div className="text-lg font-bold">{trades.length}</div>
            </div>
            <div>
              <div className="text-xs text-sub">Winning Trades</div>
              <div className="text-lg font-bold text-green-400">
                {trades.filter(t => t.pnl > 0).length}
              </div>
            </div>
            <div>
              <div className="text-xs text-sub">Losing Trades</div>
              <div className="text-lg font-bold text-red-400">
                {trades.filter(t => t.pnl < 0).length}
              </div>
            </div>
            <div>
              <div className="text-xs text-sub">Open Trades</div>
              <div className="text-lg font-bold text-yellow-400">
                {trades.filter(t => !t.exit_ts).length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
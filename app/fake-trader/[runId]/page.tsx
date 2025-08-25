'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';

type FakeTradeRun = {
  run_id: string;
  name: string | null;
  symbols: string[];
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  params: any;
  seed: number;
  status: string;
  starting_capital: number;
  current_capital: number;
  max_concurrent_positions: number;
  started_at: string;
  last_update: string;
  stopped_at: string | null;
  error: string | null;
  created_at: string;
};

type FakePosition = {
  position_id: string;
  run_id: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  cost_basis: number;
  market_value: number;
  stop_loss: number | null;
  take_profit: number | null;
  leverage: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

type FakeTrade = {
  trade_id: string;
  run_id: string;
  symbol: string;
  side: string;
  entry_ts: string;
  exit_ts: string | null;
  qty: number;
  entry_px: number;
  exit_px: number | null;
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  reason: string;
  leverage: number;
  status: string;
};

export default function FakeTraderDetailsPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<FakeTradeRun | null>(null);
  const [positions, setPositions] = useState<FakePosition[]>([]);
  const [trades, setTrades] = useState<FakeTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFakeTraderDetails() {
      try {
        // Fetch run details
        const runRes = await fetch(`/api/fake-trader/runs/${runId}`, { cache: 'no-store' });
        
        if (!runRes.ok) {
          throw new Error(`HTTP ${runRes.status}`);
        }
        
        const runData = await runRes.json();
        setRun(runData.run);
        
        // Fetch positions
        const positionsRes = await fetch(`/api/fake-trader/runs/${runId}/positions`, { cache: 'no-store' });
        if (positionsRes.ok) {
          const positionsData = await positionsRes.json();
          setPositions(positionsData.positions || []);
        } else {
          console.error('Failed to fetch positions:', positionsRes.status);
          setPositions([]);
        }
        
        // Fetch trades
        const tradesRes = await fetch(`/api/fake-trader/runs/${runId}/trades`, { cache: 'no-store' });
        if (tradesRes.ok) {
          const tradesData = await tradesRes.json();
          setTrades(tradesData.trades || []);
        } else {
          console.error('Failed to fetch trades:', tradesRes.status);
          setTrades([]);
        }
        
        // Set page title
        if (runData.run?.name) {
          document.title = `${runData.run.name} - Fake Trader Details`;
        } else {
          document.title = `Fake Trader ${runId} - Details`;
        }
      } catch (e: any) {
        console.error('Failed to fetch fake trader details:', e);
        setError(e.message);
        document.title = 'Fake Trader Details - Error';
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      fetchFakeTraderDetails();
    }
  }, [runId]);

  // Poll for updates every 10 seconds if the run is active
  useEffect(() => {
    if (!run || run.status !== 'active') return;

    const interval = setInterval(async () => {
      try {
        // Refresh run details
        const runRes = await fetch(`/api/fake-trader/runs/${runId}`, { cache: 'no-store' });
        if (runRes.ok) {
          const runData = await runRes.json();
          setRun(runData.run);
        }
        
        // Refresh positions
        const positionsRes = await fetch(`/api/fake-trader/runs/${runId}/positions`, { cache: 'no-store' });
        if (positionsRes.ok) {
          const positionsData = await positionsRes.json();
          setPositions(positionsData.positions || []);
        }
        
        // Refresh trades
        const tradesRes = await fetch(`/api/fake-trader/runs/${runId}/trades`, { cache: 'no-store' });
        if (tradesRes.ok) {
          const tradesData = await tradesRes.json();
          setTrades(tradesData.trades || []);
        }
      } catch (e) {
        console.error('Failed to refresh fake trader data:', e);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [run, runId]);

  async function toggleRunStatus(newStatus: string) {
    if (!run) return;
    
    try {
      const res = await fetch(`/api/fake-trader/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      
      // Refresh run data
      const runRes = await fetch(`/api/fake-trader/runs/${runId}`, { cache: 'no-store' });
      if (runRes.ok) {
        const runData = await runRes.json();
        setRun(runData.run);
      }
    } catch (e: any) {
      alert(`Failed to ${newStatus} run: ${e.message}`);
    }
  }

  async function handleForceExit() {
    if (!run) return;
    
    const confirmed = window.confirm(
      'Are you sure you want to force exit all positions? This will immediately close all open positions at market price and stop the run.'
    );
    
    if (!confirmed) return;
    
    try {
      const res = await fetch(`/api/fake-trader/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_exit' })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      alert(result.message);
      
      // Refresh run data
      const runRes = await fetch(`/api/fake-trader/runs/${runId}`, { cache: 'no-store' });
      if (runRes.ok) {
        const runData = await runRes.json();
        setRun(runData.run);
      }
      
      // Refresh positions and trades
      setPositions([]);
      setTrades([]);
      
    } catch (e: any) {
      alert(`Failed to force exit positions: ${e.message}`);
    }
  }

  function formatTimestamp(timestamp: string) {
    return new Date(timestamp).toLocaleString();
  }

  function formatCapital(capital: number) {
    return `$${capital.toLocaleString()}`;
  }

  function calculatePnL(startingCapital: number, currentCapital: number) {
    const pnl = currentCapital - startingCapital;
    const pnlPercent = ((pnl / startingCapital) * 100);
    return { pnl, pnlPercent };
  }

  function getDurationString(startTime: string, endTime?: string | null) {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-center">Loading fake trader details...</div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="p-6">
        <div className="text-center text-red-400">
          {error ? `Error loading fake trader: ${error}` : 'Fake trader not found'}
        </div>
      </main>
    );
  }

  const { pnl, pnlPercent } = calculatePnL(run.starting_capital, run.current_capital);
  const openPositions = positions.filter(p => p.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {run.name || 'Unnamed Fake Trader'}
        </h1>
        <div className="flex items-center gap-3">
          {/* Status and Control Buttons */}
          <div className="flex items-center gap-2">
            {run.status === 'active' && (
              <>
                <button
                  onClick={() => toggleRunStatus('paused')}
                  className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-700 rounded font-medium"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={() => toggleRunStatus('winding_down')}
                  className="px-3 py-1 text-sm bg-orange-600 hover:bg-orange-700 rounded font-medium"
                >
                  🏁 Exit Trade
                </button>
                <button
                  onClick={() => handleForceExit()}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded font-medium"
                >
                  ⚡ Force Exit
                </button>
                <button
                  onClick={() => toggleRunStatus('stopped')}
                  className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded font-medium"
                >
                  ⏹ Stop
                </button>
              </>
            )}
            {run.status === 'winding_down' && (
              <>
                <button
                  onClick={() => handleForceExit()}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded font-medium"
                >
                  ⚡ Force Exit
                </button>
                <button
                  onClick={() => toggleRunStatus('stopped')}
                  className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded font-medium"
                >
                  ⏹ Stop
                </button>
              </>
            )}
            {run.status === 'paused' && (
              <>
                <button
                  onClick={() => toggleRunStatus('active')}
                  className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded font-medium"
                >
                  ▶ Resume
                </button>
                <button
                  onClick={() => toggleRunStatus('winding_down')}
                  className="px-3 py-1 text-sm bg-orange-600 hover:bg-orange-700 rounded font-medium"
                >
                  🏁 Exit Trade
                </button>
                <button
                  onClick={() => handleForceExit()}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded font-medium"
                >
                  ⚡ Force Exit
                </button>
              </>
            )}
          </div>
          <div className={`px-3 py-1 rounded text-sm font-medium ${
            run.status === 'active' && 'bg-green-500/20 text-green-400'
          } ${
            run.status === 'winding_down' && 'bg-orange-500/20 text-orange-400'
          } ${
            run.status === 'paused' && 'bg-yellow-500/20 text-yellow-400'
          } ${
            run.status === 'stopped' && 'bg-gray-500/20 text-gray-400'
          } ${
            run.status === 'error' && 'bg-red-500/20 text-red-400'
          }`}>
            {run.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Capital Summary */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-2xl font-bold mb-6">💰 Capital Summary</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-sub text-sm">Starting Capital</div>
            <div className="text-3xl font-bold text-blue-400">
              {formatCapital(run.starting_capital)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sub text-sm">Current P&L</div>
            <div className={clsx("text-3xl font-bold", pnl >= 0 ? "text-good" : "text-bad")}>
              {pnl >= 0 ? '+' : ''}{formatCapital(pnl)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sub text-sm">Current Capital</div>
            <div className={clsx("text-3xl font-bold", run.current_capital >= run.starting_capital ? "text-good" : "text-bad")}>
              {formatCapital(run.current_capital)}
            </div>
          </div>
        </div>
        <div className="mt-4 text-center">
          <div className="text-sm text-sub">
            Return: <span className={clsx("font-medium", pnlPercent >= 0 ? "text-good" : "text-bad")}>
              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Basic Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-sub">Run ID:</span> <span className="font-mono">{run.run_id}</span></div>
            <div><span className="text-sub">Strategy:</span> {run.strategy_name} v{run.strategy_version}</div>
            <div><span className="text-sub">Timeframe:</span> {run.timeframe}</div>
            <div><span className="text-sub">Max Positions:</span> {run.max_concurrent_positions}</div>
            <div><span className="text-sub">Started:</span> {formatTimestamp(run.started_at)}</div>
            <div><span className="text-sub">Duration:</span> {getDurationString(run.started_at, run.stopped_at)}</div>
            {run.stopped_at && (
              <div><span className="text-sub">Stopped:</span> {formatTimestamp(run.stopped_at)}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Symbols ({run.symbols.length})</h2>
          <div className="flex flex-wrap gap-1">
            {run.symbols.map(symbol => (
              <span key={symbol} className="bg-pill border border-pillBorder px-2 py-1 rounded text-xs">
                {symbol}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Trading Activity</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-sub">Open Positions:</span> <span className="font-medium">{openPositions.length}</span></div>
            <div><span className="text-sub">Closed Trades:</span> <span className="font-medium">{closedTrades.length}</span></div>
            <div><span className="text-sub">Last Update:</span> {formatTimestamp(run.last_update)}</div>
            {run.status === 'active' && (
              <div className="text-xs text-green-400">🟢 Live trading every 1 minute</div>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {run.status === 'error' && run.error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-xl font-semibold mb-4 text-red-400">Error Details</h2>
          <div className="text-red-400 text-sm whitespace-pre-wrap">{run.error}</div>
        </div>
      )}

      {/* Parameters */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Strategy Parameters</h2>
        <pre className="text-xs bg-bg border border-border rounded p-3 overflow-x-auto">
          {JSON.stringify(run.params, null, 2)}
        </pre>
      </div>

      {/* Current Positions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">🎯 Open Positions ({openPositions.length})</h2>
        {openPositions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3">Symbol</th>
                  <th className="text-right py-3">Side</th>
                  <th className="text-right py-3">Size</th>
                  <th className="text-right py-3">Entry Price</th>
                  <th className="text-right py-3">Current Price</th>
                  <th className="text-right py-3">P&L</th>
                  <th className="text-right py-3">Opened</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map(position => (
                  <tr key={position.position_id} className="border-b border-border/50">
                    <td className="py-3 font-medium">{position.symbol}</td>
                    <td className="text-right py-3">
                      <span className={clsx(
                        'px-2 py-1 rounded text-xs',
                        position.side === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {position.side}
                      </span>
                    </td>
                    <td className="text-right py-3">{position.size.toFixed(4)}</td>
                    <td className="text-right py-3">${position.entry_price.toFixed(2)}</td>
                    <td className="text-right py-3">${position.current_price.toFixed(2)}</td>
                    <td className={clsx("text-right py-3 font-medium", position.unrealized_pnl >= 0 ? "text-good" : "text-bad")}>
                      ${position.unrealized_pnl.toFixed(2)}
                    </td>
                    <td className="text-right py-3">{formatTimestamp(position.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-sub py-8">
            <p>No open positions</p>
          </div>
        )}
      </div>

      {/* Trade History */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">📊 Trade History ({closedTrades.length})</h2>
        {closedTrades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3">Symbol</th>
                  <th className="text-right py-3">Side</th>
                  <th className="text-right py-3">Qty</th>
                  <th className="text-right py-3">Entry</th>
                  <th className="text-right py-3">Exit</th>
                  <th className="text-right py-3">P&L</th>
                  <th className="text-right py-3">Fees</th>
                  <th className="text-right py-3">Net</th>
                  <th className="text-right py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 20).map(trade => (
                  <tr key={trade.trade_id} className="border-b border-border/50">
                    <td className="py-3 font-medium">{trade.symbol}</td>
                    <td className="text-right py-3">
                      <span className={clsx(
                        'px-2 py-1 rounded text-xs',
                        trade.side === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="text-right py-3">{trade.qty.toFixed(4)}</td>
                    <td className="text-right py-3">${trade.entry_px.toFixed(2)}</td>
                    <td className="text-right py-3">${trade.exit_px?.toFixed(2) || 'N/A'}</td>
                    <td className={clsx("text-right py-3 font-medium", trade.realized_pnl >= 0 ? "text-good" : "text-bad")}>
                      ${trade.realized_pnl.toFixed(2)}
                    </td>
                    <td className="text-right py-3 text-sub">${trade.fees.toFixed(2)}</td>
                    <td className={clsx("text-right py-3 font-medium", (trade.realized_pnl - trade.fees) >= 0 ? "text-good" : "text-bad")}>
                      ${(trade.realized_pnl - trade.fees).toFixed(2)}
                    </td>
                    <td className="text-right py-3">{formatTimestamp(trade.entry_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {closedTrades.length > 20 && (
              <div className="text-center text-sub text-xs mt-4">
                Showing latest 20 trades of {closedTrades.length} total
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-sub py-8">
            <p>No completed trades yet</p>
            {run.status === 'active' && (
              <p className="text-xs mt-2">Trades will appear here as they are executed</p>
            )}
          </div>
        )}
      </div>

      {/* Performance Chart Placeholder */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">📈 Performance Chart</h2>
        <div className="text-center text-sub py-12">
          <p className="text-lg">Performance Chart Coming Soon</p>
          <p className="text-sm mt-2">Real-time equity curve and P&L tracking will be displayed here</p>
        </div>
      </div>
    </main>
  );
}
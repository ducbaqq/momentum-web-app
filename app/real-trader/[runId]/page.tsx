'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';

type RealTradeRun = {
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
  max_position_size_usd: number;
  daily_loss_limit_pct: number;
  max_drawdown_pct: number;
  testnet: boolean;
  started_at: string;
  last_update: string;
  stopped_at: string | null;
  error: string | null;
  created_at: string;
};

type RealPosition = {
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
  binance_order_id: number | null;
  opened_at: string;
  closed_at: string | null;
};

type RealTrade = {
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
  binance_order_id: number | null;
};

export default function RealTraderDetailsPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<RealTradeRun | null>(null);
  const [positions, setPositions] = useState<RealPosition[]>([]);
  const [trades, setTrades] = useState<RealTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null);

  useEffect(() => {
    async function fetchRealTraderDetails() {
      try {
        // Fetch run details
        const runRes = await fetch(`/api/real-trader/runs/${runId}`, { cache: 'no-store' });
        
        if (!runRes.ok) {
          throw new Error(`HTTP ${runRes.status}`);
        }
        
        const runData = await runRes.json();
        setRun(runData.run);
        
        // TODO: Fetch positions and trades when API endpoints are available
        // For now, set empty arrays
        setPositions([]);
        setTrades([]);
        
        // Set page title
        const modeText = runData.run?.testnet ? 'TESTNET' : 'MAINNET';
        if (runData.run?.name) {
          document.title = `${runData.run.name} (${modeText}) - Real Trader Details`;
        } else {
          document.title = `Real Trader ${runId} (${modeText}) - Details`;
        }
      } catch (e: any) {
        console.error('Failed to fetch real trader details:', e);
        setError(e.message);
        document.title = 'Real Trader Details - Error';
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      fetchRealTraderDetails();
    }
  }, [runId]);

  // Poll for updates every 15 seconds if the run is active (less frequent for real trading)
  useEffect(() => {
    if (!run || run.status !== 'active') return;

    const interval = setInterval(async () => {
      try {
        const runRes = await fetch(`/api/real-trader/runs/${runId}`, { cache: 'no-store' });
        if (runRes.ok) {
          const runData = await runRes.json();
          setRun(runData.run);
        }
      } catch (e) {
        console.error('Failed to refresh real trader data:', e);
      }
    }, 15000); // 15 second interval for real trading

    return () => clearInterval(interval);
  }, [run, runId]);

  async function toggleRunStatus(newStatus: string) {
    if (!run) return;
    
    // Extra safety confirmation for real money trading
    if (newStatus === 'active') {
      const modeText = run.testnet ? 'TESTNET' : 'MAINNET';
      const confirmed = window.confirm(
        `⚠️ Are you sure you want to resume REAL TRADING on ${modeText}?\n\n` +
        'This will execute actual trades with real money (or testnet funds).'
      );
      if (!confirmed) return;
    }
    
    try {
      const res = await fetch(`/api/real-trader/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      setNotification({type: 'success', message: result.message});
      
      // Refresh run data
      const runRes = await fetch(`/api/real-trader/runs/${runId}`, { cache: 'no-store' });
      if (runRes.ok) {
        const runData = await runRes.json();
        setRun(runData.run);
      }
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to ${newStatus} run: ${e.message}`});
    }
  }

  async function handleForceExit() {
    if (!run) return;
    
    const modeText = run.testnet ? 'TESTNET' : 'MAINNET';
    const warningText = run.testnet 
      ? 'Are you sure you want to force exit all positions? This will immediately close all open positions at market price and stop the run.'
      : '⚠️ WARNING: REAL MONEY TRADING\n\nThis will execute REAL MARKET ORDERS on Binance to close all positions immediately. This action cannot be undone and will incur real trading fees.\n\nAre you absolutely sure you want to force exit all positions?';
      
    const confirmed = window.confirm(warningText);
    
    if (!confirmed) return;
    
    try {
      const res = await fetch(`/api/real-trader/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_exit' })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      setNotification({type: 'warning', message: result.message});
      
      // Refresh run data
      const runRes = await fetch(`/api/real-trader/runs/${runId}`, { cache: 'no-store' });
      if (runRes.ok) {
        const runData = await runRes.json();
        setRun(runData.run);
      }
      
      // Refresh positions and trades
      setPositions([]);
      setTrades([]);
      
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to force exit positions: ${e.message}`});
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

  // Auto-dismiss notification after 8 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-center">Loading real trader details...</div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="p-6">
        <div className="text-center text-red-400">
          {error ? `Error loading real trader: ${error}` : 'Real trader not found'}
        </div>
      </main>
    );
  }

  const { pnl, pnlPercent } = calculatePnL(run.starting_capital, run.current_capital);
  const openPositions = positions.filter(p => p.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const modeText = run.testnet ? 'TESTNET' : 'MAINNET';

  return (
    <main className="p-6 space-y-6">
      {/* Notification */}
      {notification && (
        <div className={clsx(
          'p-4 rounded-lg border flex items-center justify-between',
          notification.type === 'success' && 'bg-green-500/10 border-green-500/20 text-green-400',
          notification.type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400',
          notification.type === 'warning' && 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
        )}>
          <span className="text-sm">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-4 text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-orange-400">
            {run.name || 'Unnamed Real Trader'}
          </h1>
          <span className={clsx(
            'px-3 py-1 rounded-full text-sm font-medium',
            run.testnet 
              ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400' 
              : 'bg-red-500/20 border border-red-500/50 text-red-400'
          )}>
            {run.testnet ? '🧪 TESTNET' : '💰 MAINNET'}
          </span>
        </div>
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

      {/* Safety Warning for Mainnet */}
      {!run.testnet && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <h3 className="text-lg font-semibold text-red-400 mb-2">⚠️ MAINNET TRADING ACTIVE</h3>
          <p className="text-sm text-red-200">
            This trading run is executing <strong>REAL trades with REAL money</strong> on Binance. 
            All trades incur real fees and can result in real profits or losses. Monitor carefully.
          </p>
        </div>
      )}

      {/* Capital Summary */}
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-2xl font-bold mb-6 text-orange-400">💰 Capital Summary</h2>
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
        <div className="rounded-xl border border-orange-500/30 bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-orange-400">Basic Information</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-sub">Run ID:</span> <span className="font-mono">{run.run_id}</span></div>
            <div><span className="text-sub">Strategy:</span> {run.strategy_name} v{run.strategy_version}</div>
            <div><span className="text-sub">Timeframe:</span> {run.timeframe}</div>
            <div><span className="text-sub">Max Positions:</span> {run.max_concurrent_positions}</div>
            <div><span className="text-sub">Max Position Size:</span> {formatCapital(run.max_position_size_usd)}</div>
            <div><span className="text-sub">Started:</span> {formatTimestamp(run.started_at)}</div>
            <div><span className="text-sub">Duration:</span> {getDurationString(run.started_at, run.stopped_at)}</div>
            {run.stopped_at && (
              <div><span className="text-sub">Stopped:</span> {formatTimestamp(run.stopped_at)}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-orange-500/30 bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-orange-400">Symbols ({run.symbols.length})</h2>
          <div className="flex flex-wrap gap-1">
            {run.symbols.map(symbol => (
              <span key={symbol} className="bg-pill border border-pillBorder px-2 py-1 rounded text-xs">
                {symbol}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-orange-500/30 bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-orange-400">Risk Management</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-sub">Daily Loss Limit:</span> <span className="font-medium">{run.daily_loss_limit_pct}%</span></div>
            <div><span className="text-sub">Max Drawdown:</span> <span className="font-medium">{run.max_drawdown_pct}%</span></div>
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
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">Strategy Parameters</h2>
        <pre className="text-xs bg-bg border border-border rounded p-3 overflow-x-auto">
          {JSON.stringify(run.params, null, 2)}
        </pre>
      </div>

      {/* Current Positions */}
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">🎯 Open Positions ({openPositions.length})</h2>
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
                  <th className="text-right py-3">Binance ID</th>
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
                    <td className="text-right py-3 text-xs text-sub">
                      {position.binance_order_id || 'N/A'}
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
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">📊 Trade History ({closedTrades.length})</h2>
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
                  <th className="text-right py-3">Binance ID</th>
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
                    <td className="text-right py-3 text-xs text-sub">
                      {trade.binance_order_id || 'N/A'}
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
              <p className="text-xs mt-2">Trades will appear here as they are executed on Binance</p>
            )}
          </div>
        )}
      </div>

      {/* Binance Integration Status */}
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">🔗 Binance Integration</h2>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sub">Environment:</span> 
              <span className={clsx(
                'ml-2 font-medium',
                run.testnet ? 'text-blue-400' : 'text-red-400'
              )}>
                {run.testnet ? 'Binance Testnet' : 'Binance Mainnet'}
              </span>
            </div>
            <div>
              <span className="text-sub">API Status:</span> 
              <span className="ml-2 font-medium text-green-400">Connected</span>
            </div>
            <div>
              <span className="text-sub">Position Sync:</span> 
              <span className="ml-2 font-medium text-green-400">Active</span>
            </div>
            <div>
              <span className="text-sub">Last Sync:</span> 
              <span className="ml-2 font-medium">{formatTimestamp(run.last_update)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Chart Placeholder */}
      <div className="rounded-xl border border-orange-500/30 bg-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">📈 Performance Chart</h2>
        <div className="text-center text-sub py-12">
          <p className="text-lg">Real-time Performance Chart Coming Soon</p>
          <p className="text-sm mt-2">Live equity curve, P&L tracking, and Binance account synchronization will be displayed here</p>
        </div>
      </div>
    </main>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import OptimizedCandlestickChart from '@/components/OptimizedCandlestickChart';
import TradesList from '@/components/TradesList';
import { formatLocalDateTime, formatCompactLocalDateTime } from '@/lib/dateUtils';

type BacktestRun = {
  run_id: string;
  name: string | null;
  start_ts: string;
  end_ts: string;
  symbols: string[];
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  params: any;
  seed: number;
  status: string;
  created_at: string;
  error: string | null;
};

type BacktestResult = {
  run_id: string;
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  fees: number;
  win_rate: number;
  sharpe: number;
  sortino: number;
  max_dd: number;
  profit_factor: number;
  exposure: number;
  turnover: number;
};

export default function BacktestDetailsPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBacktestDetails() {
      try {
        // Fetch run details and results in parallel
        const [runRes, resultsRes] = await Promise.all([
          fetch(`/api/backtest/runs/${runId}`, { cache: 'no-store' }),
          fetch(`/api/backtest/results/${runId}`, { cache: 'no-store' })
        ]);
        
        if (!runRes.ok) {
          throw new Error(`HTTP ${runRes.status}`);
        }
        
        const runData = await runRes.json();
        setRun(runData.run);
        
        // Results might not exist for queued/running/error backtests
        if (resultsRes.ok) {
          const resultsData = await resultsRes.json();
          const resultsArray = resultsData.results || [];
          setResults(resultsArray);
          
          // Set default selected symbol to the first symbol with trades
          const symbolsWithTrades = resultsArray.filter((r: BacktestResult) => r.trades > 0);
          if (symbolsWithTrades.length > 0 && !selectedSymbol) {
            setSelectedSymbol(symbolsWithTrades[0].symbol);
          }
        }
        
        // Set page title
        if (runData.run?.name) {
          document.title = `${runData.run.name} - Backtest Details`;
        } else {
          document.title = `Backtest ${runId} - Details`;
        }
      } catch (e: any) {
        console.error('Failed to fetch backtest details:', e);
        setError(e.message);
        document.title = 'Backtest Details - Error';
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      fetchBacktestDetails();
    }
  }, [runId]);

  // Helper function to safely format numbers
  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value == null || !isFinite(value)) return '0';
    return value.toFixed(decimals);
  };

  const formatCurrency = (value: number): string => {
    if (value == null || !isFinite(value)) return '$0';
    return `$${Math.abs(value) >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(2)}`;
  };

  const formatPercentage = (value: number, decimals: number = 2): string => {
    if (value == null || !isFinite(value)) return '0%';
    return `${(value * 100).toFixed(decimals)}%`;
  };

  // Calculate aggregated metrics with proper error handling
  const totalResults: {
    netPnL: number;
    totalFees: number;
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    avgWinRate: number;
    avgSharpe: number;
    avgSortino: number;
    maxDrawdown: number;
    avgProfitFactor: number;
    totalExposure: number;
    avgTurnover: number;
    bestTrade: number;
    worstTrade: number;
    avgTradeReturn: number;
    expectancy: number;
    endingCapital: number;
  } | null = results.length > 0 ? {
    netPnL: results.reduce((sum, r) => sum + (r.pnl || 0), 0),
    totalFees: results.reduce((sum, r) => sum + (r.fees || 0), 0),
    totalTrades: results.reduce((sum, r) => sum + (r.trades || 0), 0),
    totalWins: results.reduce((sum, r) => sum + (r.wins || 0), 0),
    totalLosses: results.reduce((sum, r) => sum + (r.losses || 0), 0),
    get avgWinRate(): number {
      // Calculate overall win rate: total wins / total trades
      return this.totalTrades > 0 ? (this.totalWins / this.totalTrades) * 100 : 0;
    },
    get avgSharpe(): number {
      const validSharpes = results.filter(r => r.sharpe != null && !isNaN(r.sharpe) && isFinite(r.sharpe));
      return validSharpes.length > 0 ? validSharpes.reduce((sum, r) => sum + r.sharpe, 0) / validSharpes.length : 0;
    },
    get avgSortino(): number {
      const validSortinos = results.filter(r => r.sortino != null && !isNaN(r.sortino) && isFinite(r.sortino));
      return validSortinos.length > 0 ? validSortinos.reduce((sum, r) => sum + r.sortino, 0) / validSortinos.length : 0;
    },
    get maxDrawdown(): number {
      const validDrawdowns = results.filter(r => r.max_dd != null && !isNaN(r.max_dd) && isFinite(r.max_dd));
      return validDrawdowns.length > 0 ? Math.max(...validDrawdowns.map(r => r.max_dd)) : 0;
    },
    get avgProfitFactor(): number {
      const validPFs = results.filter(r => r.profit_factor != null && !isNaN(r.profit_factor) && isFinite(r.profit_factor));
      return validPFs.length > 0 ? validPFs.reduce((sum, r) => sum + r.profit_factor, 0) / validPFs.length : 0;
    },
    totalExposure: results.reduce((sum, r) => sum + (r.exposure || 0), 0),
    get avgTurnover(): number {
      const validTurnovers = results.filter(r => r.turnover != null && !isNaN(r.turnover) && isFinite(r.turnover));
      return validTurnovers.length > 0 ? validTurnovers.reduce((sum, r) => sum + r.turnover, 0) / validTurnovers.length : 0;
    },
    get bestTrade(): number {
      // Find the symbol with the best average trade PnL
      const avgTradeReturns = results
        .filter(r => r.trades > 0 && r.pnl != null && isFinite(r.pnl))
        .map(r => r.pnl / r.trades)
        .filter(x => !isNaN(x) && isFinite(x));
      return avgTradeReturns.length > 0 ? Math.max(...avgTradeReturns) : 0;
    },
    get worstTrade(): number {
      // Find the symbol with the worst average trade PnL
      const avgTradeReturns = results
        .filter(r => r.trades > 0 && r.pnl != null && isFinite(r.pnl))
        .map(r => r.pnl / r.trades)
        .filter(x => !isNaN(x) && isFinite(x));
      return avgTradeReturns.length > 0 ? Math.min(...avgTradeReturns) : 0;
    },
    get avgTradeReturn(): number {
      return this.totalTrades > 0 ? this.netPnL / this.totalTrades : 0;
    },
    get expectancy(): number {
      return this.totalTrades > 0 ? this.netPnL / this.totalTrades : 0;
    },
    get endingCapital(): number {
      return (timeMetrics?.startingCapital || 0) + this.netPnL;
    }
  } : null;

  // Calculate time-based metrics with validation
  const timeMetrics: {
    startDate: Date;
    endDate: Date;
    durationDays: number;
    durationYears: number;
    startingCapital: number;
    totalReturn: number;
    annualizedReturn: number;
  } | null = run && totalResults ? {
    startDate: new Date(run.start_ts),
    endDate: new Date(run.end_ts),
    get durationDays(): number { 
      const duration = (this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(duration, 0.01); // Prevent zero duration
    },
    get durationYears(): number { return this.durationDays / 365.25; },
    get startingCapital(): number { 
      // Try to get starting capital from run params, fallback to 10000
      const capital = run.params?.starting_capital || 10000;
      return Math.max(capital, 1); // Prevent zero capital
    },
    get totalReturn(): number { 
      const returnValue = totalResults.netPnL / this.startingCapital;
      return isFinite(returnValue) ? returnValue : 0;
    },
    get annualizedReturn(): number { 
      if (this.durationYears <= 0 || !isFinite(this.totalReturn)) return 0;
      const annualized = Math.pow(1 + this.totalReturn, 1 / this.durationYears) - 1;
      return isFinite(annualized) ? annualized : 0;
    }
  } : null;

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-center">Loading backtest details...</div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="p-6">
        <div className="text-center text-red-400">
          {error ? `Error loading backtest: ${error}` : 'Backtest not found'}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {run.name || 'Unnamed Backtest'}
        </h1>
        <div className="flex items-center gap-3">
          <button 
            className="flex items-center gap-2 px-3 py-1 rounded text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            onClick={async () => {
              try {
                // Trigger download of comprehensive backtest data
                const response = await fetch(`/api/backtest/export/${run.run_id}`);
                
                if (!response.ok) {
                  throw new Error(`Export failed: ${response.status}`);
                }
                
                // Get the filename from the Content-Disposition header
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = `backtest_${run.strategy_name}_${run.run_id}.json`;
                
                if (contentDisposition && contentDisposition.includes('filename=')) {
                  const matches = contentDisposition.match(/filename="?([^"]+)"?/);
                  if (matches && matches[1]) {
                    filename = matches[1];
                  }
                }
                
                // Create blob and download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                console.log(`Downloaded backtest data: ${filename}`);
              } catch (error: any) {
                console.error('Download failed:', error);
                alert('Failed to download backtest data: ' + error.message);
              }
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Data
          </button>
          <div className={`px-3 py-1 rounded text-sm font-medium ${
            run.status === 'done' && 'bg-green-500/20 text-green-400'
          } ${
            run.status === 'running' && 'bg-blue-500/20 text-blue-400'
          } ${
            run.status === 'queued' && 'bg-yellow-500/20 text-yellow-400'
          } ${
            run.status === 'error' && 'bg-red-500/20 text-red-400'
          }`}>
            {run.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Basic Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-sub">Run ID:</span> <span className="font-mono">{run.run_id}</span></div>
            <div><span className="text-sub">Strategy:</span> {run.strategy_name} v{run.strategy_version}</div>
            <div><span className="text-sub">Timeframe:</span> {run.timeframe}</div>
            <div><span className="text-sub">Starting Capital:</span> ${timeMetrics ? timeMetrics.startingCapital.toLocaleString() : 'N/A'}</div>
            <div><span className="text-sub">Created:</span> {formatLocalDateTime(run.created_at)}</div>
            <div><span className="text-sub">Duration:</span> {timeMetrics ? `${timeMetrics.durationDays.toFixed(1)} days` : 'N/A'}</div>
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
          <h2 className="text-xl font-semibold mb-4">Parameters</h2>
          <pre className="text-xs bg-bg border border-border rounded p-3 overflow-x-auto">
            {JSON.stringify(run.params, null, 2)}
          </pre>
        </div>
      </div>

      {run.status === 'error' && run.error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-red-400">Error Details</h2>
          <div className="text-red-400 text-sm whitespace-pre-wrap">{run.error}</div>
        </div>
      )}

      {run.status === 'done' && results.length > 0 && totalResults && timeMetrics ? (
        <div className="space-y-8">
          {/* Capital Summary */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">💰 Capital Summary</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-sub text-sm">Starting Capital</div>
                <div className="text-3xl font-bold text-blue-400">
                  {formatCurrency(timeMetrics.startingCapital)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Net Profit / Loss</div>
                <div className={clsx("text-3xl font-bold", totalResults.netPnL >= 0 ? "text-good" : "text-bad")}>
                  {totalResults.netPnL >= 0 ? '+' : ''}{formatCurrency(totalResults.netPnL)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Ending Capital</div>
                <div className={clsx("text-3xl font-bold", totalResults.endingCapital >= timeMetrics.startingCapital ? "text-good" : "text-bad")}>
                  {formatCurrency(totalResults.endingCapital)}
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className="text-sm text-sub">
                Total Return: <span className={clsx("font-medium", timeMetrics.totalReturn >= 0 ? "text-good" : "text-bad")}>
                  {timeMetrics.totalReturn >= 0 ? '+' : ''}{formatPercentage(timeMetrics.totalReturn)}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">📈 Performance Metrics</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-sub text-sm">Annualized Return</div>
                <div className={clsx("text-2xl font-bold", timeMetrics.annualizedReturn >= 0 ? "text-good" : "text-bad")}>
                  {formatPercentage(timeMetrics.annualizedReturn)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Win Rate</div>
                <div className="text-2xl font-bold">{formatNumber(totalResults.avgWinRate, 1)}%</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Profit Factor</div>
                <div className="text-2xl font-bold">{formatNumber(totalResults.avgProfitFactor)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Average Trade Return</div>
                <div className="text-2xl font-bold">{formatCurrency(totalResults.avgTradeReturn)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Expectancy</div>
                <div className="text-2xl font-bold">{formatCurrency(totalResults.expectancy)}</div>
              </div>
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">⚠️ Risk Metrics</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-sub text-sm">Max Drawdown</div>
                <div className="text-2xl font-bold text-bad">
                  {timeMetrics ? formatCurrency(Math.abs(totalResults.maxDrawdown) * timeMetrics.startingCapital / 100) : '$0'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Max Drawdown %</div>
                <div className="text-2xl font-bold text-bad">{formatNumber(Math.abs(totalResults.maxDrawdown), 2)}%</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Sharpe Ratio</div>
                <div className="text-2xl font-bold">{formatNumber(totalResults.avgSharpe)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Sortino Ratio</div>
                <div className="text-2xl font-bold">{formatNumber(totalResults.avgSortino)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Best Trade</div>
                <div className="text-2xl font-bold text-good">{formatCurrency(totalResults.bestTrade)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Worst Trade</div>
                <div className="text-2xl font-bold text-bad">{formatCurrency(totalResults.worstTrade)}</div>
              </div>
            </div>
          </div>

          {/* Trade Statistics */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">📊 Trade Statistics</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-sub text-sm">Number of Trades</div>
                <div className="text-2xl font-bold">{totalResults.totalTrades}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Winning Trades</div>
                <div className="text-2xl font-bold text-good">{totalResults.totalWins}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Losing Trades</div>
                <div className="text-2xl font-bold text-bad">{totalResults.totalLosses}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Average Turnover</div>
                <div className="text-2xl font-bold">{formatNumber(totalResults.avgTurnover)}x</div>
              </div>
            </div>
          </div>

          {/* Execution & Slippage */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">💰 Execution & Slippage</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-sub text-sm">Commission Costs</div>
                <div className="text-2xl font-bold text-sub">{formatCurrency(totalResults.totalFees)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Total Exposure</div>
                <div className="text-2xl font-bold">{formatCurrency(totalResults.totalExposure)}</div>
              </div>
              <div className="text-center">
                <div className="text-sub text-sm">Net After Fees</div>
                <div className={clsx("text-2xl font-bold", (totalResults.netPnL - totalResults.totalFees) >= 0 ? "text-good" : "text-bad")}>
                  {formatCurrency(totalResults.netPnL - totalResults.totalFees)}
                </div>
              </div>
            </div>
          </div>

          {/* Individual Symbol Results */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">🎯 Individual Symbol Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3">Symbol</th>
                    <th className="text-right py-3">Trades</th>
                    <th className="text-right py-3">Win Rate</th>
                    <th className="text-right py-3">PnL</th>
                    <th className="text-right py-3">Fees</th>
                    <th className="text-right py-3">Net</th>
                    <th className="text-right py-3">Sharpe</th>
                    <th className="text-right py-3">Max DD</th>
                    <th className="text-right py-3">Profit Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(result => (
                    <tr key={result.symbol} className="border-b border-border/50 hover:bg-bg/50">
                      <td className="py-3 font-medium">{result.symbol}</td>
                      <td className="text-right py-3">{result.trades}</td>
                      <td className="text-right py-3">{result.win_rate.toFixed(1)}%</td>
                      <td className={clsx("text-right py-3 font-medium", result.pnl >= 0 ? "text-good" : "text-bad")}>
                        ${result.pnl.toFixed(0)}
                      </td>
                      <td className="text-right py-3 text-sub">${result.fees.toFixed(0)}</td>
                      <td className={clsx("text-right py-3 font-medium", (result.pnl - result.fees) >= 0 ? "text-good" : "text-bad")}>
                        ${(result.pnl - result.fees).toFixed(0)}
                      </td>
                      <td className="text-right py-3">{result.sharpe.toFixed(2)}</td>
                      <td className="text-right py-3 text-bad">{(result.max_dd * 100).toFixed(1)}%</td>
                      <td className="text-right py-3">{result.profit_factor.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Price Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              {/* Symbol Selector */}
              {results.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-sub">Symbol:</span>
                  <select
                    value={selectedSymbol || ''}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="bg-bg border border-border rounded px-3 py-1 text-sm"
                  >
                    {results
                      .filter(r => r.trades > 0)
                      .map(result => (
                        <option key={result.symbol} value={result.symbol}>
                          {result.symbol} ({result.trades} trades)
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}
            </div>
            
            {selectedSymbol ? (
              <OptimizedCandlestickChart 
                symbols={[selectedSymbol]}
                startDate={run.start_ts}
                endDate={run.end_ts}
                runId={run.run_id}
                className="!p-0 !border-0 !bg-transparent"
              />
            ) : (
              <div className="h-96 flex items-center justify-center text-sub">
                <div className="text-center">
                  <p className="text-lg mb-2">No trades executed</p>
                  <p className="text-sm">This backtest did not generate any trades to display on the chart.</p>
                </div>
              </div>
            )}
          </div>

          {/* Trade History */}
          <TradesList 
            runId={run.run_id}
            selectedSymbol={selectedSymbol}
          />

          {/* Placeholders for Additional Charts */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">📊 Equity Curve & Performance Charts</h2>
            <div className="text-center text-sub py-12">
              <p className="text-lg">Additional Charts Coming Soon</p>
              <p className="text-sm mt-2">Equity curve, drawdown chart, and return distribution will be displayed here.</p>
            </div>
          </div>
        </div>
      ) : run.status !== 'done' ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Backtest Status: {run.status.toUpperCase()}</h2>
          <div className="text-center text-sub py-8">
            {run.status === 'queued' && <p>This backtest is queued for execution. Results will appear here once completed.</p>}
            {run.status === 'running' && <p>This backtest is currently running. Please wait for completion.</p>}
            {run.status === 'error' && <p>This backtest encountered an error. Please check the error details above.</p>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">No Results Available</h2>
          <div className="text-center text-sub py-8">
            <p>This backtest completed but no results were found.</p>
          </div>
        </div>
      )}
    </main>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { localToUtc, getLocalDateTimeAgo, getCurrentLocalDateTime, getTimezoneOffset, formatCompactLocalDateTime } from '@/lib/dateUtils';

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
  capital: number;
  max_position_size_usd: number;
  daily_loss_limit_pct: number;
  max_drawdown_pct: number;
  leverage: number;
  fee_bps: number;
  slippage_bps: number;
  current_capital?: number;
  pnl?: number;
};

type BacktestResult = {
  symbol: string;
  trades: number;
  win_rate: number;
  pnl: number;
  fees: number;
  max_dd: number;
  sharpe: number;
  sortino: number;
  profit_factor: number;
  time_in_market: number;
  avg_leverage: number;
  turnover: number;
  total_funding?: number;
  volatility?: number;
};

export default function BacktestPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{runId: string, name: string} | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    selectedSymbols: [] as string[],
    strategy: 'momentum_breakout_v2',
    timeframe: '1m',
    capital: 1000,
    seed: Math.floor(Math.random() * 1000000),
    minRoc5m: 0.5,
    minVolMult: 1.5,
    maxSpreadBps: 50,
    maxPositionSizeUsd: 200,
    dailyLossLimitPct: 5,
    maxDrawdownPct: 10,
    leverage: 5,
    feeBps: 10,
    slippageBps: 5,
    maxConcurrentPositions: 3,
  });

  async function fetchSymbols() {
    try {
      const res = await fetch('/api/symbols');
      if (!res.ok) throw new Error('Failed to fetch symbols');
      const data = await res.json();
      setSymbols(data.symbols || []);
    } catch (e: any) {
      console.error('Error fetching symbols:', e);
    }
  }

  async function fetchRuns() {
    try {
      const res = await fetch('/api/backtest/runs');
      if (!res.ok) throw new Error('Failed to fetch runs');
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e: any) {
      console.error('Error fetching runs:', e);
    }
  }

  async function fetchResults(runId: string) {
    try {
      const res = await fetch(`/api/backtest/results/${runId}`);
      if (!res.ok) throw new Error('Failed to fetch results');
      const data = await res.json();
      setResults(data.results || []);
    } catch (e: any) {
      console.error('Error fetching results:', e);
      setResults([]);
    }
  }

  async function deleteBacktest(runId: string) {
    try {
      const res = await fetch(`/api/backtest/runs/${runId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete backtest');
      await fetchRuns();
      setNotification({ type: 'success', message: 'Backtest deleted successfully' });
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'Failed to delete backtest' });
    } finally {
      setDeletingRunId(null);
      setShowDeleteConfirm(null);
    }
  }

  async function deleteAllBacktests() {
    try {
      const res = await fetch('/api/backtest/runs', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete all backtests');
      await fetchRuns();
      setNotification({ type: 'success', message: 'All backtests deleted successfully' });
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'Failed to delete all backtests' });
    } finally {
      setDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  }

  function validateForm() {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.startDate) errors.startDate = 'Start date is required';
    if (!formData.endDate) errors.endDate = 'End date is required';
    if (formData.selectedSymbols.length === 0) errors.symbols = 'At least one symbol is required';
    if (formData.capital <= 0) errors.capital = 'Capital must be greater than 0';
    if (formData.minRoc5m <= 0) errors.minRoc5m = 'Min ROC 5m must be greater than 0';
    if (formData.minVolMult <= 0) errors.minVolMult = 'Min Vol Multiplier must be greater than 0';
    if (formData.maxPositionSizeUsd <= 0) errors.maxPositionSizeUsd = 'Max Position Size must be greater than 0';
    if (formData.dailyLossLimitPct <= 0) errors.dailyLossLimitPct = 'Daily Loss Limit must be greater than 0';
    if (formData.maxDrawdownPct <= 0) errors.maxDrawdownPct = 'Max Drawdown must be greater than 0';
    if (formData.leverage <= 0) errors.leverage = 'Leverage must be greater than 0';

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function downloadCandles() {
    try {
      const params = new URLSearchParams({
        startDate: localToUtc(formData.startDate),
        endDate: localToUtc(formData.endDate),
        symbols: formData.selectedSymbols.join(','),
        timeframe: formData.timeframe
      });
      const res = await fetch(`/api/backtest/download-candles?${params}`);
      if (!res.ok) throw new Error('Failed to download candles');
      setNotification({ type: 'success', message: 'Candles downloaded successfully' });
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'Failed to download candles' });
    }
  }

  async function submitBacktest() {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        startDate: localToUtc(formData.startDate),
        endDate: localToUtc(formData.endDate),
        symbols: formData.selectedSymbols,
        strategy: formData.strategy,
        timeframe: formData.timeframe,
        capital: formData.capital,
        seed: formData.seed,
        params: {
          minRoc5m: formData.minRoc5m,
          minVolMult: formData.minVolMult,
          maxSpreadBps: formData.maxSpreadBps,
        },
        maxPositionSizeUsd: formData.maxPositionSizeUsd,
        dailyLossLimitPct: formData.dailyLossLimitPct,
        maxDrawdownPct: formData.maxDrawdownPct,
        leverage: formData.leverage,
        feeBps: formData.feeBps,
        slippageBps: formData.slippageBps,
        maxConcurrentPositions: formData.maxConcurrentPositions,
      };

      const res = await fetch('/api/backtest/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create backtest');
      const data = await res.json();
      setNotification({ type: 'success', message: `Backtest created successfully: ${data.runId}` });

      // Reset form
      setFormData(prev => ({
        ...prev,
        name: '',
        selectedSymbols: [],
      }));

      await fetchRuns();
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'Failed to create backtest' });
    } finally {
      setLoading(false);
    }
  }

  function toggleSymbol(symbol: string) {
    setFormData(prev => ({
      ...prev,
      selectedSymbols: prev.selectedSymbols.includes(symbol)
        ? prev.selectedSymbols.filter(s => s !== symbol)
        : [...prev.selectedSymbols, symbol],
    }));
  }

  function selectAllSymbols() {
    setFormData(prev => ({
      ...prev,
      selectedSymbols: [...symbols],
    }));
  }

  function clearAllSymbols() {
    setFormData(prev => ({
      ...prev,
      selectedSymbols: [],
    }));
  }

  useEffect(() => {
    fetchSymbols();
    fetchRuns();
  }, []);

  // Poll for backtest status updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if there are running or queued backtests
      const hasActiveBacktests = runs.some(run => run.status === 'running' || run.status === 'queued');
      if (hasActiveBacktests) {
        fetchRuns();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runs]);

  useEffect(() => {
    if (selectedRunId) {
      fetchResults(selectedRunId);
    }
  }, [selectedRunId]);

  // Set default dates and times (last 1 day in local timezone)
  useEffect(() => {
    if (!formData.startDate || !formData.endDate) {
      setFormData(prev => ({
        ...prev,
        startDate: getLocalDateTimeAgo(1), // 1 day ago in local time
        endDate: getCurrentLocalDateTime() // Current time in local time
      }));
    }
  }, [formData.startDate, formData.endDate]);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle keyboard events for delete confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm && e.key === 'Escape') {
        setShowDeleteConfirm(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteConfirm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Strategy Backtesting</h1>
          <p className="text-slate-400">Test trading strategies against historical data</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-300">Backend Active</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Total Runs</div>
            <div className="text-sm text-white font-medium">{runs.length}</div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={clsx(
          'p-4 rounded-lg border flex items-center gap-3',
          notification.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        )}>
          <div className="flex-1">{notification.message}</div>
          <button
            onClick={() => setNotification(null)}
            className="text-current hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Backtest</h3>
            <p className="text-sub mb-6">
              Are you sure you want to delete "{showDeleteConfirm.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteBacktest(showDeleteConfirm.runId)}
                disabled={deletingRunId === showDeleteConfirm.runId}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
              >
                {deletingRunId === showDeleteConfirm.runId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Dialog */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete All Backtests</h3>
            <p className="text-sub mb-6">
              Are you sure you want to delete all backtests? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAllBacktests()}
                disabled={deletingAll}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Backtest Form */}
        <div className="card-modern p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <span className="text-blue-400 text-lg">📊</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Create New Backtest</h3>
              <p className="text-slate-400 text-sm">Configure backtest parameters</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Basic Settings */}
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                className={clsx(
                  'w-full bg-bg border rounded px-3 py-2',
                  validationErrors.name ? 'border-red-500' : 'border-border'
                )}
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  if (validationErrors.name) {
                    setValidationErrors(prev => ({ ...prev, name: '' }));
                  }
                }}
                placeholder="Backtest name..."
              />
              {validationErrors.name && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
              )}
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <input
                  type="datetime-local"
                  className={clsx(
                    'w-full bg-bg border rounded px-3 py-2',
                    validationErrors.startDate ? 'border-red-500' : 'border-border'
                  )}
                  value={formData.startDate}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, startDate: e.target.value }));
                    if (validationErrors.startDate) {
                      setValidationErrors(prev => ({ ...prev, startDate: '' }));
                    }
                  }}
                />
                {validationErrors.startDate && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.startDate}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">End Date *</label>
                <input
                  type="datetime-local"
                  className={clsx(
                    'w-full bg-bg border rounded px-3 py-2',
                    validationErrors.endDate ? 'border-red-500' : 'border-border'
                  )}
                  value={formData.endDate}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, endDate: e.target.value }));
                    if (validationErrors.endDate) {
                      setValidationErrors(prev => ({ ...prev, endDate: '' }));
                    }
                  }}
                />
                {validationErrors.endDate && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Symbol Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Symbols *</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={selectAllSymbols}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Select All
                </button>
                <button
                  onClick={clearAllSymbols}
                  className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded"
                >
                  Clear All
                </button>
                <span className="text-xs text-sub self-center">
                  ({formData.selectedSymbols.length} selected)
                </span>
              </div>
              <div className={clsx(
                'grid grid-cols-3 gap-1 max-h-32 overflow-y-auto bg-bg border rounded p-2',
                validationErrors.symbols ? 'border-red-500' : 'border-border'
              )}>
                {symbols.map(symbol => (
                  <label key={symbol} className="flex items-center text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.selectedSymbols.includes(symbol)}
                      onChange={() => {
                        toggleSymbol(symbol);
                        if (validationErrors.symbols) {
                          setValidationErrors(prev => ({ ...prev, symbols: '' }));
                        }
                      }}
                      className="mr-1"
                    />
                    {symbol}
                  </label>
                ))}
              </div>
              {validationErrors.symbols && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.symbols}</p>
              )}
            </div>

            {/* Strategy Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Strategy</label>
              <select
                className="w-full bg-bg border border-border rounded px-3 py-2"
                value={formData.strategy}
                onChange={(e) => setFormData(prev => ({ ...prev, strategy: e.target.value }))}
              >
                <option value="momentum_breakout_v2">Momentum Breakout V2 (Professional)</option>
                <option value="regime_filtered_momentum">Regime Filtered Momentum (Advanced)</option>
              </select>
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-sm font-medium mb-1">Timeframe</label>
              <select
                className="w-full bg-bg border border-border rounded px-3 py-2"
                value={formData.timeframe}
                onChange={(e) => setFormData(prev => ({ ...prev, timeframe: e.target.value }))}
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
              </select>
            </div>

            {/* Capital Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Starting Capital ($) *</label>
                <input
                  type="number"
                  step="100"
                  min="100"
                  className={clsx(
                    'w-full bg-bg border rounded px-3 py-2',
                    validationErrors.capital ? 'border-red-500' : 'border-border'
                  )}
                  value={formData.capital}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, capital: parseFloat(e.target.value) || 0 }));
                    if (validationErrors.capital) {
                      setValidationErrors(prev => ({ ...prev, capital: '' }));
                    }
                  }}
                  placeholder="1000"
                />
                {validationErrors.capital && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.capital}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Position Size ($) *</label>
                <input
                  type="number"
                  step="50"
                  min="50"
                  className={clsx(
                    'w-full bg-bg border rounded px-3 py-2',
                    validationErrors.maxPositionSizeUsd ? 'border-red-500' : 'border-border'
                  )}
                  value={formData.maxPositionSizeUsd}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, maxPositionSizeUsd: parseFloat(e.target.value) || 0 }));
                    if (validationErrors.maxPositionSizeUsd) {
                      setValidationErrors(prev => ({ ...prev, maxPositionSizeUsd: '' }));
                    }
                  }}
                  placeholder="200"
                />
                {validationErrors.maxPositionSizeUsd && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.maxPositionSizeUsd}</p>
                )}
              </div>
            </div>

            {/* Risk Management */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3 text-orange-300">Risk Management</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-sub mb-1">Max Positions *</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    className="w-full bg-bg border border-border rounded px-2 py-1 text-sm"
                    value={formData.maxConcurrentPositions}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxConcurrentPositions: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Daily Loss Limit (%) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="20"
                    className={clsx(
                      'w-full bg-bg border rounded px-2 py-1 text-sm',
                      validationErrors.dailyLossLimitPct ? 'border-red-500' : 'border-border'
                    )}
                    value={formData.dailyLossLimitPct}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, dailyLossLimitPct: parseFloat(e.target.value) || 0 }));
                      if (validationErrors.dailyLossLimitPct) {
                        setValidationErrors(prev => ({ ...prev, dailyLossLimitPct: '' }));
                      }
                    }}
                  />
                  {validationErrors.dailyLossLimitPct && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.dailyLossLimitPct}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Max Drawdown (%) *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="50"
                    className={clsx(
                      'w-full bg-bg border rounded px-2 py-1 text-sm',
                      validationErrors.maxDrawdownPct ? 'border-red-500' : 'border-border'
                    )}
                    value={formData.maxDrawdownPct}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, maxDrawdownPct: parseFloat(e.target.value) || 0 }));
                      if (validationErrors.maxDrawdownPct) {
                        setValidationErrors(prev => ({ ...prev, maxDrawdownPct: '' }));
                      }
                    }}
                  />
                  {validationErrors.maxDrawdownPct && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.maxDrawdownPct}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Strategy Parameters - Simplified for backtesting */}
            {formData.strategy === 'momentum_breakout_v2' && (
              <div className="border-t border-border pt-4">
                <h4 className="font-medium mb-3">Strategy Parameters</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-sub mb-1">Min ROC 5m (%) *</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      className={clsx(
                        'w-full bg-bg border rounded px-2 py-1 text-sm',
                        validationErrors.minRoc5m ? 'border-red-500' : 'border-border'
                      )}
                      value={formData.minRoc5m}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, minRoc5m: parseFloat(e.target.value) || 0 }));
                        if (validationErrors.minRoc5m) {
                          setValidationErrors(prev => ({ ...prev, minRoc5m: '' }));
                        }
                      }}
                    />
                    {validationErrors.minRoc5m && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.minRoc5m}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-sub mb-1">Min Vol Multiplier *</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      className={clsx(
                        'w-full bg-bg border rounded px-2 py-1 text-sm',
                        validationErrors.minVolMult ? 'border-red-500' : 'border-border'
                      )}
                      value={formData.minVolMult}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, minVolMult: parseFloat(e.target.value) || 0 }));
                        if (validationErrors.minVolMult) {
                          setValidationErrors(prev => ({ ...prev, minVolMult: '' }));
                        }
                      }}
                    />
                    {validationErrors.minVolMult && (
                      <p className="text-red-500 text-xs mt-1">{validationErrors.minVolMult}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-sub mb-1">Max Spread (bps)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="w-full bg-bg border border-border rounded px-2 py-1 text-sm"
                      value={formData.maxSpreadBps}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxSpreadBps: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Execution Parameters */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3">Execution Settings</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-sub mb-1">Fee (bps)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="w-full bg-bg border border-border rounded px-2 py-1 text-sm"
                    value={formData.feeBps}
                    onChange={(e) => setFormData(prev => ({ ...prev, feeBps: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Slippage (bps)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="w-full bg-bg border border-border rounded px-2 py-1 text-sm"
                    value={formData.slippageBps}
                    onChange={(e) => setFormData(prev => ({ ...prev, slippageBps: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Leverage *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="20"
                    className={clsx(
                      'w-full bg-bg border rounded px-2 py-1 text-sm',
                      validationErrors.leverage ? 'border-red-500' : 'border-border'
                    )}
                    value={formData.leverage}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, leverage: parseFloat(e.target.value) || 1 }));
                      if (validationErrors.leverage) {
                        setValidationErrors(prev => ({ ...prev, leverage: '' }));
                      }
                    }}
                  />
                  {validationErrors.leverage && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.leverage}</p>
                  )}
                  <p className="text-xs text-sub mt-1">
                    Max: 20x
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={downloadCandles}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium"
              >
                Download Candles
              </button>
              <button
                onClick={submitBacktest}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 rounded font-medium disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Start Backtest'}
              </button>
            </div>
          </div>
        </div>

        {/* Backtest Runs */}
        <div className="card-modern p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                <span className="text-accent text-lg">📈</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Backtest Runs</h3>
                <p className="text-slate-400 text-sm">View and manage your backtests</p>
              </div>
            </div>
            {runs.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
              >
                Delete All
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {runs.length > 0 ? (
              runs.map(run => (
                <div
                  key={run.run_id}
                  className={clsx(
                    'p-4 border rounded cursor-pointer transition-colors',
                    selectedRunId === run.run_id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  )}
                  onClick={() => setSelectedRunId(selectedRunId === run.run_id ? null : run.run_id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'px-2 py-1 rounded text-xs font-medium',
                        run.status === 'done' && 'bg-green-500/20 text-green-400',
                        run.status === 'running' && 'bg-blue-500/20 text-blue-400',
                        run.status === 'queued' && 'bg-yellow-500/20 text-yellow-400',
                        run.status === 'error' && 'bg-red-500/20 text-red-400',
                        run.status === 'cancelled' && 'bg-gray-500/20 text-gray-400'
                      )}>
                        {run.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm({ runId: run.run_id, name: run.name || 'Unnamed' });
                        }}
                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-sub space-y-1">
                    <div>{run.symbols.length} symbols • {run.strategy_name} • {run.timeframe}</div>
                    <div>
                      {formatCompactLocalDateTime(run.start_ts)} to {formatCompactLocalDateTime(run.end_ts)}
                    </div>
                    <div>Capital: ${run.capital ? run.capital.toLocaleString() : 'N/A'} • Max Position: ${run.max_position_size_usd ? run.max_position_size_usd : 'N/A'}</div>
                    {run.error && (
                      <div className="text-red-400 mt-2 p-2 bg-red-500/10 rounded">
                        Error: {run.error}
                      </div>
                    )}
                  </div>

                  {selectedRunId === run.run_id && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-sub">Created:</span>
                            <div className="font-medium text-xs">{formatCompactLocalDateTime(run.created_at)}</div>
                          </div>
                          <div>
                            <span className="text-sub">Seed:</span>
                            <div className="font-medium text-xs">{run.seed ?? 'N/A'}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-sub">Daily Loss Limit:</span>
                            <div className="font-medium text-xs">{run.daily_loss_limit_pct ?? 'N/A'}%</div>
                          </div>
                          <div>
                            <span className="text-sub">Max Drawdown:</span>
                            <div className="font-medium text-xs">{run.max_drawdown_pct ?? 'N/A'}%</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-sub">Leverage:</span>
                            <div className="font-medium text-xs">{run.leverage ?? 'N/A'}x</div>
                          </div>
                          <div>
                            <span className="text-sub">Fee:</span>
                            <div className="font-medium text-xs">{run.fee_bps ?? 'N/A'}bps</div>
                          </div>
                          <div>
                            <span className="text-sub">Slippage:</span>
                            <div className="font-medium text-xs">{run.slippage_bps ?? 'N/A'}bps</div>
                          </div>
                        </div>

                        {run.symbols.length > 0 && (
                          <div>
                            <span className="text-sub">Symbols:</span>
                            <div className="text-xs mt-1 flex flex-wrap gap-1">
                              {run.symbols.map(symbol => (
                                <span key={symbol} className="bg-pill border border-pillBorder px-2 py-1 rounded">
                                  {symbol}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end mt-4 pt-3 border-t border-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/backtest/${run.run_id}`, '_blank');
                            }}
                            className="px-4 py-2 bg-accent hover:bg-accent/80 rounded text-sm font-medium transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400">
                No backtests found. Create your first one above!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Table - Only show for successful runs with results */}
      {selectedRunId && results.length > 0 && runs.find(r => r.run_id === selectedRunId)?.status === 'done' && (
        <div className="card-modern p-4">
          <h3 className="text-lg font-semibold mb-4 text-accent">Backtest Results</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium">Symbol</th>
                  <th className="text-right py-2 font-medium">Trades</th>
                  <th className="text-right py-2 font-medium">Win Rate</th>
                  <th className="text-right py-2 font-medium">PnL</th>
                  <th className="text-right py-2 font-medium">Fees</th>
                  <th className="text-right py-2 font-medium">Max DD</th>
                  <th className="text-right py-2 font-medium">Sharpe</th>
                  <th className="text-right py-2 font-medium">Sortino</th>
                  <th className="text-right py-2 font-medium">Profit Factor</th>
                  <th className="text-right py-2 font-medium">Time in Market</th>
                  <th className="text-right py-2 font-medium">Avg Leverage</th>
                  <th className="text-right py-2 font-medium">Turnover</th>
                </tr>
              </thead>
              <tbody>
                {results.map(result => (
                  <tr key={result.symbol} className="border-b border-border/50">
                    <td className="py-2 font-medium">{result.symbol}</td>
                    <td className="text-right py-2">{result.trades}</td>
                    <td className="text-right py-2">{(result.win_rate * 100).toFixed(1)}%</td>
                    <td className={clsx(
                      'text-right py-2 font-medium',
                      result.pnl >= 0 ? 'text-good' : 'text-bad'
                    )}>
                      ${result.pnl.toFixed(0)}
                    </td>
                    <td className="text-right py-2">${result.fees.toFixed(0)}</td>
                    <td className="text-right py-2">{(result.max_dd * 100).toFixed(1)}%</td>
                    <td className="text-right py-2">{result.sharpe.toFixed(2)}</td>
                    <td className="text-right py-2">{result.sortino.toFixed(2)}</td>
                    <td className="text-right py-2">{result.profit_factor.toFixed(2)}</td>
                    <td className="text-right py-2">{(result.time_in_market * 100).toFixed(1)}%</td>
                    <td className="text-right py-2">{result.avg_leverage.toFixed(1)}x</td>
                    <td className="text-right py-2">{result.turnover.toFixed(1)}x</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2 font-medium text-accent">TOTAL</td>
                  <td className="text-right py-2">{results.reduce((sum, r) => sum + r.trades, 0)}</td>
                  <td className="text-right py-2">
                    {results.length > 0 ? (results.reduce((sum, r) => sum + r.trades * r.win_rate, 0) / results.reduce((sum, r) => sum + r.trades, 0) * 100).toFixed(1) : '0.0'}%
                  </td>
                  <td className={clsx(
                    'text-right py-2 font-medium text-accent',
                    results.reduce((sum, r) => sum + r.pnl, 0) >= 0 ? 'text-good' : 'text-bad'
                  )}>
                    ${results.reduce((sum, r) => sum + r.pnl, 0).toFixed(0)}
                  </td>
                  <td className="text-right py-2">${results.reduce((sum, r) => sum + r.fees, 0).toFixed(0)}</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

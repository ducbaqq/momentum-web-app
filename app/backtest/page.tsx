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
  starting_capital: number | string;
  total_pnl: number | string;
  ending_capital: number | string;
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
  max_dd: number;
  profit_factor: number;
  turnover: number;
  // Enhanced metrics
  sortino?: number;
  calmar?: number;
  time_in_market?: number;
  avg_leverage?: number;
  max_leverage?: number;
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
    timeframe: '1m',
    
    // Capital settings
    startingCapital: 1000,
    
    // Momentum Breakout V2 Strategy parameters
    minRoc5m: 0.5,
    minVolMult: 2,
    maxSpreadBps: 8,
    
    // Execution parameters
    feeBps: 4,
    slippageBps: 2,
    leverage: 20,
  });

  async function fetchSymbols() {
    try {
      const res = await fetch('/api/symbols', { cache: 'no-store' });
      const data = await res.json();
      setSymbols(data.symbols || []);
    } catch (e) {
      console.error('Failed to fetch symbols:', e);
      setNotification({type: 'error', message: 'Failed to fetch symbols'});
    }
  }

  async function fetchRuns() {
    try {
      const res = await fetch('/api/backtest/runs', { cache: 'no-store' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e: any) {
      console.error('Failed to fetch runs:', e);
      setNotification({type: 'error', message: `Failed to fetch backtest runs: ${e.message}`});
    }
  }

  async function fetchResults(runId: string) {
    try {
      const res = await fetch(`/api/backtest/results/${runId}`, { cache: 'no-store' });
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      console.error('Failed to fetch results:', e);
      setResults([]);
      setNotification({type: 'error', message: 'Failed to fetch backtest results'});
    }
  }

  async function deleteBacktest(runId: string) {
    setDeletingRunId(runId);
    try {
      const res = await fetch(`/api/backtest/runs?run_id=${runId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setNotification({type: 'success', message: result.message});
      
      // Remove the deleted run from the list
      setRuns(prevRuns => prevRuns.filter(run => run.run_id !== runId));
      
      // Clear selection if the deleted run was selected
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setResults([]);
      }
      
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to delete backtest: ${e.message}`});
    } finally {
      setDeletingRunId(null);
      setShowDeleteConfirm(null);
    }
  }

  async function deleteAllBacktests() {
    setDeletingAll(true);
    try {
      const res = await fetch('/api/backtest/runs?all=true', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setNotification({type: 'success', message: result.message});
      
      // Clear all runs from the list
      setRuns([]);
      setSelectedRunId(null);
      setResults([]);
      
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to delete all backtests: ${e.message}`});
    } finally {
      setDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  }

  function validateForm() {
    const errors: Record<string, string> = {};

    // Validate name
    if (!formData.name.trim()) {
      errors.name = 'Backtest name is required';
    }

    // Validate start date
    if (!formData.startDate.trim()) {
      errors.startDate = 'Start date is required';
    }

    // Validate end date
    if (!formData.endDate.trim()) {
      errors.endDate = 'End date is required';
    }

    // Validate date range
    if (formData.startDate && formData.endDate) {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      if (startDate >= endDate) {
        errors.endDate = 'End date must be after start date';
      }
    }

    // Validate symbols selection
    if (formData.selectedSymbols.length === 0) {
      errors.symbols = 'At least one symbol must be selected';
    }

    // Validate starting capital
    if (formData.startingCapital <= 0) {
      errors.startingCapital = 'Starting capital must be greater than 0';
    }
    if (formData.startingCapital < 1000) {
      errors.startingCapital = 'Starting capital should be at least $1,000';
    }
    if (formData.startingCapital > 10000000) {
      errors.startingCapital = 'Starting capital cannot exceed $10,000,000';
    }

    // Validate momentum_breakout_v2 strategy parameters
    if (formData.minRoc5m <= 0) {
      errors.minRoc5m = 'Min ROC 5m must be greater than 0';
    }
    if (formData.minVolMult <= 0) {
      errors.minVolMult = 'Min Vol Multiplier must be greater than 0';
    }

    // Validate common parameters
    if (formData.maxSpreadBps < 0) {
      errors.maxSpreadBps = 'Max Spread cannot be negative';
    }

    // Validate execution parameters
    if (formData.feeBps < 0) {
      errors.feeBps = 'Fee cannot be negative';
    }
    if (formData.slippageBps < 0) {
      errors.slippageBps = 'Slippage cannot be negative';
    }
    if (formData.leverage <= 0) {
      errors.leverage = 'Leverage must be greater than 0';
    }
    if (formData.leverage > 100) {
      errors.leverage = 'Leverage cannot exceed 100';
    }

    return errors;
  }

  async function downloadCandles() {
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      setNotification({type: 'error', message: 'Please fix form errors before downloading candles'});
      return;
    }

    setLoading(true);
    try {
      const payload = {
        symbols: formData.selectedSymbols,
        startDate: localToUtc(formData.startDate),
        endDate: localToUtc(formData.endDate),
        timeframe: formData.timeframe
      };

      const response = await fetch('/api/backtest/download-candles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'candles.json';

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setNotification({type: 'success', message: `Candle data downloaded: ${filename}`});
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to download candles: ${e.message}`});
    } finally {
      setLoading(false);
    }
  }

  async function submitBacktest() {
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      // Build momentum_breakout_v2 strategy parameters
      let strategyParams: any = {
        maxSpreadBps: formData.maxSpreadBps,
        starting_capital: formData.startingCapital,
        feeBps: formData.feeBps,
        slippageBps: formData.slippageBps,
        leverage: formData.leverage,
        minRoc5m: formData.minRoc5m,
        minVolMult: formData.minVolMult
      };

      const payload = {
        name: formData.name,
        start_ts: localToUtc(formData.startDate), // Convert local time to UTC for API
        end_ts: localToUtc(formData.endDate), // Convert local time to UTC for API
        symbols: formData.selectedSymbols,
        timeframe: formData.timeframe,
        strategy_name: 'momentum_breakout_v2',
        strategy_version: '1.0',
        starting_capital: formData.startingCapital,
        params: strategyParams,
        execution: {
          feeBps: formData.feeBps,
          slippageBps: formData.slippageBps,
          leverage: formData.leverage,
        },
        seed: Math.floor(Math.random() * 1000000)
      };

      const res = await fetch('/api/backtest/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      setNotification({type: 'success', message: `Backtest queued successfully! Run ID: ${result.run_id}`});
      
      // Refresh the runs list and show any errors that occur
      try {
        await fetchRuns();
      } catch (refreshError) {
        // fetchRuns already handles its own error notifications, but we want to clarify the context
        setNotification({type: 'error', message: 'Backtest was created but failed to refresh the runs list. Please refresh the page.'});
      }
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to create backtest: ${e.message}`});
    } finally {
      setLoading(false);
    }
  }

  function toggleSymbol(symbol: string) {
    setFormData(prev => ({
      ...prev,
      selectedSymbols: prev.selectedSymbols.includes(symbol)
        ? prev.selectedSymbols.filter(s => s !== symbol)
        : [...prev.selectedSymbols, symbol]
    }));
  }

  function selectAllSymbols() {
    setFormData(prev => ({ ...prev, selectedSymbols: symbols }));
  }

  function clearAllSymbols() {
    setFormData(prev => ({ ...prev, selectedSymbols: [] }));
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

    if (showDeleteConfirm) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDeleteConfirm]);

  return (
    <main className="space-y-6">
      <h2 className="text-2xl font-bold">Backtest</h2>

      {/* Notification */}
      {notification && (
        <div className={clsx(
          'p-4 rounded-lg border flex items-center justify-between',
          notification.type === 'success' && 'bg-green-500/10 border-green-500/20 text-green-400',
          notification.type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400'
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

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onKeyDown={(e) => e.key === 'Escape' && setShowDeleteConfirm(null)}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Backtest</h3>
            <p className="text-sm text-sub mb-6">
              Are you sure you want to delete "<span className="font-medium text-white">{showDeleteConfirm.name || 'Unnamed'}</span>"? 
              <br />
              <span className="text-red-400">This will permanently remove all associated data including trades, results, and equity history.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm border border-border rounded hover:bg-bg transition-colors"
                disabled={deletingRunId !== null}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteBacktest(showDeleteConfirm.runId)}
                disabled={deletingRunId !== null}
                className={clsx(
                  'px-4 py-2 text-sm rounded font-medium transition-colors',
                  deletingRunId === showDeleteConfirm.runId 
                    ? 'bg-red-600/50 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700'
                )}
              >
                {deletingRunId === showDeleteConfirm.runId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Dialog */}
      {showDeleteAllConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onKeyDown={(e) => e.key === 'Escape' && setShowDeleteAllConfirm(false)}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete All Backtests</h3>
            <p className="text-sm text-sub mb-6">
              Are you sure you want to delete <span className="font-medium text-white">all {runs.length} backtest runs</span>? 
              <br />
              <span className="text-red-400">This will permanently remove all backtest data including trades, results, and equity history for every run.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-2 text-sm border border-border rounded hover:bg-bg transition-colors"
                disabled={deletingAll}
              >
                Cancel
              </button>
              <button
                onClick={deleteAllBacktests}
                disabled={deletingAll}
                className={clsx(
                  'px-4 py-2 text-sm rounded font-medium transition-colors',
                  deletingAll 
                    ? 'bg-red-600/50 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700'
                )}
              >
                {deletingAll ? 'Deleting All...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Backtest Form */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-lg font-semibold mb-4">Create New Backtest</h3>
          
          <div className="space-y-4">
            {/* Basic Settings */}
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                className={`w-full bg-bg border rounded px-3 py-2 ${
                  validationErrors.name ? 'border-red-500' : 'border-border'
                }`}
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

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium">Date & Time Range *</label>
                <span className="text-xs text-sub bg-pill border border-pillBorder px-2 py-1 rounded">
                  {getTimezoneOffset()} Local Time
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-sub mb-1">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    className={`w-full bg-bg border rounded px-3 py-2 ${
                      validationErrors.startDate ? 'border-red-500' : 'border-border'
                    }`}
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
                  <label className="block text-xs text-sub mb-1">End Date & Time</label>
                  <input
                    type="datetime-local"
                    className={`w-full bg-bg border rounded px-3 py-2 ${
                      validationErrors.endDate ? 'border-red-500' : 'border-border'
                    }`}
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
              <p className="text-xs text-sub mt-1">
                Times are shown in your local timezone ({getTimezoneOffset()}) but will be converted to UTC for the backtest
              </p>
            </div>

            {/* Starting Capital */}
            <div>
              <label className="block text-sm font-medium mb-1">Starting Capital ($) *</label>
              <input
                type="number"
                step="1000"
                min="1000"
                max="10000000"
                className={`w-full bg-bg border rounded px-3 py-2 ${
                  validationErrors.startingCapital ? 'border-red-500' : 'border-border'
                }`}
                value={formData.startingCapital}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, startingCapital: parseFloat(e.target.value) || 0 }));
                  if (validationErrors.startingCapital) {
                    setValidationErrors(prev => ({ ...prev, startingCapital: '' }));
                  }
                }}
                placeholder="10000"
              />
              {validationErrors.startingCapital && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.startingCapital}</p>
              )}
              <p className="text-xs text-sub mt-1">Amount of capital to start the backtest with (minimum $1,000)</p>
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
              <div className={`grid grid-cols-3 gap-1 max-h-32 overflow-y-auto bg-bg border rounded p-2 ${
                validationErrors.symbols ? 'border-red-500' : 'border-border'
              }`}>
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



            {/* Timeframe Selection */}
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
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
              </select>
              <p className="text-xs text-sub mt-1">
                {formData.strategy === 'regime_filtered_momentum' 
                  ? 'Regime strategy works best with 15m timeframe'
                  : 'Higher timeframes reduce noise but have fewer signals'
                }
              </p>
            </div>

            {/* Strategy Parameters */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3">Momentum Breakout V2 Parameters</h4>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-sub mb-1">Min ROC 5m (%) *</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                        validationErrors.minRoc5m ? 'border-red-500' : 'border-border'
                      }`}
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
                      min="0"
                      className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                        validationErrors.minVolMult ? 'border-red-500' : 'border-border'
                      }`}
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
                </div>
              </div>

              {/* Common Parameters */}
              <div className="mt-4">
                <div>
                  <label className="block text-xs text-sub mb-1">Max Spread (bps) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.maxSpreadBps ? 'border-red-500' : 'border-border'
                    }`}
                    value={formData.maxSpreadBps}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, maxSpreadBps: parseFloat(e.target.value) || 0 }));
                      if (validationErrors.maxSpreadBps) {
                        setValidationErrors(prev => ({ ...prev, maxSpreadBps: '' }));
                      }
                    }}
                  />
                  {validationErrors.maxSpreadBps && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.maxSpreadBps}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Execution Parameters */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3">Execution Settings</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-sub mb-1">Fee (bps) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.feeBps ? 'border-red-500' : 'border-border'
                    }`}
                    value={formData.feeBps}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, feeBps: parseFloat(e.target.value) || 0 }));
                      if (validationErrors.feeBps) {
                        setValidationErrors(prev => ({ ...prev, feeBps: '' }));
                      }
                    }}
                  />
                  {validationErrors.feeBps && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.feeBps}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Slippage (bps) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.slippageBps ? 'border-red-500' : 'border-border'
                    }`}
                    value={formData.slippageBps}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, slippageBps: parseFloat(e.target.value) || 0 }));
                      if (validationErrors.slippageBps) {
                        setValidationErrors(prev => ({ ...prev, slippageBps: '' }));
                      }
                    }}
                  />
                  {validationErrors.slippageBps && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.slippageBps}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Leverage *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.leverage ? 'border-red-500' : 'border-border'
                    }`}
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
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={submitBacktest}
                disabled={loading}
                className={clsx(
                  'w-full py-2 px-4 rounded font-medium',
                  loading 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700'
                )}
              >
                {loading ? 'Creating Backtest...' : 'Create Backtest'}
              </button>
              
              <button
                onClick={downloadCandles}
                disabled={loading}
                className={clsx(
                  'w-full py-2 px-4 rounded font-medium border',
                  loading 
                    ? 'bg-gray-600 border-gray-600 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 border-blue-600'
                )}
              >
                {loading ? 'Downloading...' : '📥 Download Candle Data'}
              </button>
              
              <p className="text-xs text-sub text-center">
                Download raw candle data for the selected symbols, timeframe, and date range as JSON
              </p>
            </div>
          </div>
        </div>

        {/* Backtest Runs */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Runs</h3>
            {runs.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={deletingAll}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded transition-colors"
                title="Delete all backtest runs"
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            )}
          </div>
          
          <div className="space-y-2 flex-1 overflow-y-auto">
            {runs.map(run => (
              <div
                key={run.run_id}
                className={clsx(
                  'p-3 border rounded cursor-pointer transition-colors',
                  selectedRunId === run.run_id 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-border hover:border-gray-500'
                )}
                onClick={() => {
                  const newSelectedRunId = selectedRunId === run.run_id ? null : run.run_id;
                  setSelectedRunId(newSelectedRunId);
                  
                  // Only fetch results for successful runs
                  if (newSelectedRunId && run.status === 'done') {
                    fetchResults(newSelectedRunId);
                  } else {
                    setResults([]);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                    <div className="text-xs text-sub">
                      {run.symbols.length} symbols • {run.strategy_name} • 
                      {formatCompactLocalDateTime(run.start_ts)} - {formatCompactLocalDateTime(run.end_ts)}
                    </div>
                    {(() => {
                      // Safely convert values to numbers and check validity
                      const startingCapital = typeof run.starting_capital === 'number' ? run.starting_capital : parseFloat(run.starting_capital) || 0;
                      const endingCapital = typeof run.ending_capital === 'number' ? run.ending_capital : parseFloat(run.ending_capital) || 0;
                      const totalPnl = typeof run.total_pnl === 'number' ? run.total_pnl : parseFloat(run.total_pnl) || 0;
                      
                      // Only show if we have valid capital data and the run is done
                      if (run.status === 'done' && !isNaN(startingCapital) && !isNaN(endingCapital) && startingCapital > 0) {
                        return (
                          <div className="text-xs mt-1">
                            <span className="text-sub">Capital:</span>
                            <span className="font-medium"> ${startingCapital.toFixed(0)}</span>
                            <span className="text-sub"> → </span>
                            <span className={clsx(
                              'font-medium',
                              endingCapital >= startingCapital ? 'text-good' : 'text-bad'
                            )}>
                              ${endingCapital.toFixed(0)}
                            </span>
                            <span className={clsx(
                              'text-xs ml-1',
                              totalPnl >= 0 ? 'text-good' : 'text-bad'
                            )}>
                              ({totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)})
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm({
                          runId: run.run_id,
                          name: run.name || 'Unnamed'
                        });
                      }}
                      className="p-1 hover:bg-red-600/20 rounded transition-colors text-red-400 hover:text-red-300"
                      disabled={deletingRunId === run.run_id}
                      title="Delete backtest"
                    >
                      {deletingRunId === run.run_id ? '⏳' : '🗑️'}
                    </button>
                    <div className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      run.status === 'done' && 'bg-green-500/20 text-green-400',
                      run.status === 'running' && 'bg-blue-500/20 text-blue-400',
                      run.status === 'queued' && 'bg-yellow-500/20 text-yellow-400',
                      run.status === 'error' && 'bg-red-500/20 text-red-400'
                    )}>
                      {run.status}
                    </div>
                  </div>
                </div>
                {selectedRunId === run.run_id && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="text-sm space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-sub">Strategy:</span>
                          <div className="font-medium">{run.strategy_name} v{run.strategy_version}</div>
                        </div>
                        <div>
                          <span className="text-sub">Symbols:</span>
                          <div className="font-medium">{run.symbols.length} symbols</div>
                        </div>
                        <div>
                          <span className="text-sub">Date Range:</span>
                          <div className="font-medium">
                            {formatCompactLocalDateTime(run.start_ts)} - {formatCompactLocalDateTime(run.end_ts)}
                          </div>
                        </div>
                        <div>
                          <span className="text-sub">Created:</span>
                          <div className="font-medium">{formatCompactLocalDateTime(run.created_at)}</div>
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
                      
                      {run.params && (
                        <div>
                          <span className="text-sub">Parameters:</span>
                          <pre className="text-xs mt-1 bg-bg border border-border rounded p-2 overflow-x-auto">
{JSON.stringify({
  ...run.params,
  symbols: run.symbols,
  start_ts_unix: Math.floor(new Date(run.start_ts).getTime() / 1000),
  end_ts_unix: Math.floor(new Date(run.end_ts).getTime() / 1000)
}, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {run.status === 'error' && run.error && (
                        <div>
                          <span className="text-sub text-red-400">Error Details:</span>
                          <div className="mt-1 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                            {run.error}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm({
                              runId: run.run_id,
                              name: run.name || 'Unnamed'
                            });
                          }}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 hover:border-red-600/60 rounded text-xs font-medium transition-colors text-red-400"
                          disabled={deletingRunId === run.run_id}
                        >
                          {deletingRunId === run.run_id ? '🗑️ Deleting...' : '🗑️ Delete'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/backtest/${run.run_id}`, '_blank');
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Table - Only show for successful runs with results */}
      {selectedRunId && results.length > 0 && runs.find(r => r.run_id === selectedRunId)?.status === 'done' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-lg font-semibold mb-4">Results</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Trades</th>
                  <th className="text-right py-2">Win Rate</th>
                  <th className="text-right py-2">PnL</th>
                  <th className="text-right py-2">Fees</th>
                  <th className="text-right py-2">Max DD</th>
                  <th className="text-right py-2">Sharpe</th>
                  {results.length > 0 && results[0].sortino !== undefined && (
                    <th className="text-right py-2">Sortino</th>
                  )}
                  <th className="text-right py-2">Profit Factor</th>
                  {results.length > 0 && results[0].time_in_market !== undefined && (
                    <th className="text-right py-2">Time in Market</th>
                  )}
                  {results.length > 0 && results[0].avg_leverage !== undefined && (
                    <th className="text-right py-2">Avg Leverage</th>
                  )}
                  {results.length > 0 && results[0].turnover !== undefined && (
                    <th className="text-right py-2">Turnover</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {results.map(result => (
                  <tr key={`${result.run_id}-${result.symbol}`} className="border-b border-border/50">
                    <td className="py-2 font-medium">{result.symbol}</td>
                    <td className="text-right py-2">{result.trades}</td>
                    <td className="text-right py-2">{result.win_rate.toFixed(1)}%</td>
                    <td className={clsx(
                      'text-right py-2 font-medium',
                      result.pnl >= 0 ? 'text-good' : 'text-bad'
                    )}>
                      ${result.pnl.toFixed(0)}
                    </td>
                    <td className="text-right py-2 text-sub">${result.fees.toFixed(0)}</td>
                    <td className="text-right py-2 text-bad">{(result.max_dd * 100).toFixed(1)}%</td>
                    <td className="text-right py-2">{result.sharpe.toFixed(2)}</td>
                    {result.sortino !== undefined && (
                      <td className="text-right py-2">{result.sortino.toFixed(2)}</td>
                    )}
                    <td className="text-right py-2">{result.profit_factor.toFixed(2)}</td>
                    {result.time_in_market !== undefined && (
                      <td className="text-right py-2">{(result.time_in_market * 100).toFixed(1)}%</td>
                    )}
                    {result.avg_leverage !== undefined && (
                      <td className="text-right py-2">{result.avg_leverage.toFixed(1)}x</td>
                    )}
                    {result.turnover !== undefined && (
                      <td className="text-right py-2">${(result.turnover / 1000).toFixed(0)}k</td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2">TOTAL</td>
                  <td className="text-right py-2">{results.reduce((sum, r) => sum + r.trades, 0)}</td>
                  <td className="text-right py-2">
                    {results.length > 0 
                      ? (results.reduce((sum, r) => sum + r.win_rate, 0) / results.length).toFixed(1)
                      : '0.0'
                    }%
                  </td>
                  <td className={clsx(
                    'text-right py-2 font-bold text-lg',
                    results.reduce((sum, r) => sum + r.pnl, 0) >= 0 ? 'text-good' : 'text-bad'
                  )}>
                    ${results.reduce((sum, r) => sum + r.pnl, 0).toFixed(0)}
                  </td>
                  <td className="text-right py-2 text-sub">${results.reduce((sum, r) => sum + r.fees, 0).toFixed(0)}</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
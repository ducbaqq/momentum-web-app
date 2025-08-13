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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    selectedSymbols: [] as string[],
    strategy: 'momentum_breakout',
    timeframe: '1m',
    
    // Capital settings
    startingCapital: 10000,
    
    // Basic Strategy parameters (momentum_breakout, momentum_breakout_v2)
    minRoc5m: 1.2,
    minVolMult: 3,
    maxSpreadBps: 10,
    
    // Regime Filter (regime_filtered_momentum)
    emaLength: 200,
    rocPositive: true,
    
    // Entry Trigger (regime_filtered_momentum) 
    minVolMult15m: 3.0,
    minRoc15m: 0.6,
    bbTrigger: true,
    
    // Risk Management
    riskPerTrade: 0.3,
    atrPeriod: 14,
    atrMultiplier: 2.0,
    partialTakeLevel: 1.2,
    partialTakePercent: 50,
    trailAfterPartial: true,
    
    // Guards
    minBookImbalance: 1.2,
    avoidFundingMinute: true,
    killSwitchPercent: 2.0,
    
    // Position Management
    maxConcurrentPositions: 3,
    
    // Execution parameters
    feeBps: 4,
    slippageBps: 2,
    leverage: 1,
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

    // Validate basic strategy parameters
    if (formData.strategy === 'momentum_breakout' || formData.strategy === 'momentum_breakout_v2') {
      if (formData.minRoc5m <= 0) {
        errors.minRoc5m = 'Min ROC 5m must be greater than 0';
      }
      if (formData.minVolMult <= 0) {
        errors.minVolMult = 'Min Vol Multiplier must be greater than 0';
      }
    }

    // Validate regime filter parameters
    if (formData.strategy === 'regime_filtered_momentum') {
      if (formData.emaLength <= 0) {
        errors.emaLength = 'EMA Length must be greater than 0';
      }
      if (formData.minVolMult15m <= 0) {
        errors.minVolMult15m = 'Min Vol Multiplier 15m must be greater than 0';
      }
      if (formData.minRoc15m <= 0) {
        errors.minRoc15m = 'Min ROC 15m must be greater than 0';
      }
      if (formData.riskPerTrade <= 0 || formData.riskPerTrade > 10) {
        errors.riskPerTrade = 'Risk per trade must be between 0.1% and 10%';
      }
      if (formData.atrPeriod <= 0) {
        errors.atrPeriod = 'ATR Period must be greater than 0';
      }
      if (formData.atrMultiplier <= 0) {
        errors.atrMultiplier = 'ATR Multiplier must be greater than 0';
      }
      if (formData.partialTakeLevel <= 1) {
        errors.partialTakeLevel = 'Partial Take Level must be greater than 1';
      }
      if (formData.partialTakePercent <= 0 || formData.partialTakePercent >= 100) {
        errors.partialTakePercent = 'Partial Take Percent must be between 1% and 99%';
      }
      if (formData.minBookImbalance <= 0) {
        errors.minBookImbalance = 'Min Book Imbalance must be greater than 0';
      }
      if (formData.killSwitchPercent <= 0 || formData.killSwitchPercent > 50) {
        errors.killSwitchPercent = 'Kill Switch must be between 0.1% and 50%';
      }
      if (formData.maxConcurrentPositions <= 0) {
        errors.maxConcurrentPositions = 'Max Concurrent Positions must be greater than 0';
      }
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
      // Build strategy-specific parameters
      let strategyParams: any = {
        maxSpreadBps: formData.maxSpreadBps,
        starting_capital: formData.startingCapital,
        feeBps: formData.feeBps,
        slippageBps: formData.slippageBps,
        leverage: formData.leverage
      };

      if (formData.strategy === 'momentum_breakout' || formData.strategy === 'momentum_breakout_v2') {
        strategyParams = {
          ...strategyParams,
          minRoc5m: formData.minRoc5m,
          minVolMult: formData.minVolMult
        };
      } else if (formData.strategy === 'regime_filtered_momentum') {
        strategyParams = {
          ...strategyParams,
          // Regime Filter
          emaLength: formData.emaLength,
          rocPositive: formData.rocPositive,
          
          // Entry Trigger
          minVolMult15m: formData.minVolMult15m,
          minRoc15m: formData.minRoc15m / 100, // Convert percentage to decimal
          bbTrigger: formData.bbTrigger,
          
          // Risk Management
          riskPerTrade: formData.riskPerTrade / 100, // Convert percentage to decimal
          atrPeriod: formData.atrPeriod,
          atrMultiplier: formData.atrMultiplier,
          partialTakeLevel: formData.partialTakeLevel,
          partialTakePercent: formData.partialTakePercent / 100, // Convert percentage to decimal
          trailAfterPartial: formData.trailAfterPartial,
          
          // Guards
          minBookImbalance: formData.minBookImbalance,
          avoidFundingMinute: formData.avoidFundingMinute,
          killSwitchPercent: formData.killSwitchPercent / 100, // Convert percentage to decimal
          
          // Position Management
          maxConcurrentPositions: formData.maxConcurrentPositions
        };
      }

      const payload = {
        name: formData.name,
        start_ts: localToUtc(formData.startDate), // Convert local time to UTC for API
        end_ts: localToUtc(formData.endDate), // Convert local time to UTC for API
        symbols: formData.selectedSymbols,
        timeframe: formData.timeframe,
        strategy_name: formData.strategy,
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

            {/* Strategy Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Strategy</label>
              <select
                className="w-full bg-bg border border-border rounded px-3 py-2"
                value={formData.strategy}
                onChange={(e) => setFormData(prev => ({ ...prev, strategy: e.target.value }))}
              >
                <option value="momentum_breakout">Momentum Breakout (Basic)</option>
                <option value="momentum_breakout_v2">Momentum Breakout V2 (Professional)</option>
                <option value="regime_filtered_momentum">Regime Filtered Momentum (Advanced)</option>
              </select>
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
              <h4 className="font-medium mb-3">Strategy Parameters</h4>
              
              {/* Basic Momentum Strategy Parameters */}
              {(formData.strategy === 'momentum_breakout' || formData.strategy === 'momentum_breakout_v2') && (
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
              )}

              {/* Regime Filtered Momentum Strategy Parameters */}
              {formData.strategy === 'regime_filtered_momentum' && (
                <div className="space-y-4">
                  {/* Regime Filter Section */}
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3">
                    <h5 className="text-sm font-medium mb-2 text-blue-400">📊 Regime Filter</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">EMA Length *</label>
                        <input
                          type="number"
                          min="1"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.emaLength ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.emaLength}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, emaLength: parseInt(e.target.value) || 200 }));
                            if (validationErrors.emaLength) {
                              setValidationErrors(prev => ({ ...prev, emaLength: '' }));
                            }
                          }}
                        />
                        {validationErrors.emaLength && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.emaLength}</p>
                        )}
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.rocPositive}
                            onChange={(e) => setFormData(prev => ({ ...prev, rocPositive: e.target.checked }))}
                            className="mr-2"
                          />
                          Require Positive ROC 1h
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Entry Trigger Section */}
                  <div className="bg-green-500/5 border border-green-500/20 rounded p-3">
                    <h5 className="text-sm font-medium mb-2 text-green-400">🎯 Entry Trigger (15m)</h5>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">Min Vol Mult 15m *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.minVolMult15m ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.minVolMult15m}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, minVolMult15m: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.minVolMult15m) {
                              setValidationErrors(prev => ({ ...prev, minVolMult15m: '' }));
                            }
                          }}
                        />
                        {validationErrors.minVolMult15m && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.minVolMult15m}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-sub mb-1">Min ROC 15m (%) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.minRoc15m ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.minRoc15m}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, minRoc15m: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.minRoc15m) {
                              setValidationErrors(prev => ({ ...prev, minRoc15m: '' }));
                            }
                          }}
                        />
                        {validationErrors.minRoc15m && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.minRoc15m}</p>
                        )}
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.bbTrigger}
                            onChange={(e) => setFormData(prev => ({ ...prev, bbTrigger: e.target.checked }))}
                            className="mr-2"
                          />
                          BB Upper Breakout
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Risk Management Section */}
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded p-3">
                    <h5 className="text-sm font-medium mb-2 text-orange-400">⚠️ Risk Management</h5>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">Risk Per Trade (%) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.riskPerTrade ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.riskPerTrade}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, riskPerTrade: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.riskPerTrade) {
                              setValidationErrors(prev => ({ ...prev, riskPerTrade: '' }));
                            }
                          }}
                        />
                        {validationErrors.riskPerTrade && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.riskPerTrade}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-sub mb-1">ATR Period *</label>
                        <input
                          type="number"
                          min="1"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.atrPeriod ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.atrPeriod}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, atrPeriod: parseInt(e.target.value) || 0 }));
                            if (validationErrors.atrPeriod) {
                              setValidationErrors(prev => ({ ...prev, atrPeriod: '' }));
                            }
                          }}
                        />
                        {validationErrors.atrPeriod && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.atrPeriod}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-sub mb-1">ATR Multiplier *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.atrMultiplier ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.atrMultiplier}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, atrMultiplier: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.atrMultiplier) {
                              setValidationErrors(prev => ({ ...prev, atrMultiplier: '' }));
                            }
                          }}
                        />
                        {validationErrors.atrMultiplier && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.atrMultiplier}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">Partial Take Level (R) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="1.1"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.partialTakeLevel ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.partialTakeLevel}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, partialTakeLevel: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.partialTakeLevel) {
                              setValidationErrors(prev => ({ ...prev, partialTakeLevel: '' }));
                            }
                          }}
                        />
                        {validationErrors.partialTakeLevel && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.partialTakeLevel}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-sub mb-1">Partial Take % *</label>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.partialTakePercent ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.partialTakePercent}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, partialTakePercent: parseInt(e.target.value) || 0 }));
                            if (validationErrors.partialTakePercent) {
                              setValidationErrors(prev => ({ ...prev, partialTakePercent: '' }));
                            }
                          }}
                        />
                        {validationErrors.partialTakePercent && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.partialTakePercent}</p>
                        )}
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.trailAfterPartial}
                            onChange={(e) => setFormData(prev => ({ ...prev, trailAfterPartial: e.target.checked }))}
                            className="mr-2"
                          />
                          Trail After Partial
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Guard Conditions Section */}
                  <div className="bg-red-500/5 border border-red-500/20 rounded p-3">
                    <h5 className="text-sm font-medium mb-2 text-red-400">🛡️ Guard Conditions</h5>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">Min Book Imbalance *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.minBookImbalance ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.minBookImbalance}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, minBookImbalance: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.minBookImbalance) {
                              setValidationErrors(prev => ({ ...prev, minBookImbalance: '' }));
                            }
                          }}
                        />
                        {validationErrors.minBookImbalance && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.minBookImbalance}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-sub mb-1">Kill Switch (%) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="50"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.killSwitchPercent ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.killSwitchPercent}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, killSwitchPercent: parseFloat(e.target.value) || 0 }));
                            if (validationErrors.killSwitchPercent) {
                              setValidationErrors(prev => ({ ...prev, killSwitchPercent: '' }));
                            }
                          }}
                        />
                        {validationErrors.killSwitchPercent && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.killSwitchPercent}</p>
                        )}
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.avoidFundingMinute}
                            onChange={(e) => setFormData(prev => ({ ...prev, avoidFundingMinute: e.target.checked }))}
                            className="mr-2"
                          />
                          Avoid Funding Minutes
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Position Management Section */}
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded p-3">
                    <h5 className="text-sm font-medium mb-2 text-purple-400">📊 Position Management</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-sub mb-1">Max Concurrent Positions *</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                            validationErrors.maxConcurrentPositions ? 'border-red-500' : 'border-border'
                          }`}
                          value={formData.maxConcurrentPositions}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, maxConcurrentPositions: parseInt(e.target.value) || 0 }));
                            if (validationErrors.maxConcurrentPositions) {
                              setValidationErrors(prev => ({ ...prev, maxConcurrentPositions: '' }));
                            }
                          }}
                        />
                        {validationErrors.maxConcurrentPositions && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.maxConcurrentPositions}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
          <h3 className="text-lg font-semibold mb-4">Recent Runs</h3>
          
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
                  </div>
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
                      
                      <div className="flex justify-end mt-4 pt-3 border-t border-border/50">
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
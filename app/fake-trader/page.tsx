'use client';

import { useEffect, useState } from 'react';
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

export default function FakeTraderPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [runs, setRuns] = useState<FakeTradeRun[]>([]);
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
    selectedSymbols: [] as string[],
    strategy: 'momentum_breakout_v2',
    timeframe: '15m',
    
    // Capital settings
    startingCapital: 1000,
    maxConcurrentPositions: 3,
    
    // Basic Strategy parameters (momentum_breakout_v2)
    minRoc5m: 0.5,
    minVolMult: 2,
    maxSpreadBps: 8,
    
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
      const res = await fetch('/api/fake-trader/runs', { cache: 'no-store' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRuns(data.runs || []);
      
      // Debug log to see what we're getting
      console.log('Fake trader runs fetched:', data.runs?.length || 0, 'runs');
    } catch (e: any) {
      console.error('Failed to fetch fake trader runs:', e);
      setNotification({type: 'error', message: `Failed to fetch fake trader runs: ${e.message}`});
      // Still set runs to empty array to prevent issues
      setRuns([]);
    }
  }

  function validateForm() {
    const errors: Record<string, string> = {};

    // Validate name
    if (!formData.name.trim()) {
      errors.name = 'Fake trader name is required';
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
    if (formData.strategy === 'momentum_breakout_v2') {
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
    }

    // Validate max concurrent positions
    if (formData.maxConcurrentPositions <= 0) {
      errors.maxConcurrentPositions = 'Max Concurrent Positions must be greater than 0';
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

  async function submitFakeTrader() {
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

      if (formData.strategy === 'momentum_breakout_v2') {
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
        };
      }

      const payload = {
        name: formData.name,
        symbols: formData.selectedSymbols,
        timeframe: formData.timeframe,
        strategy_name: formData.strategy,
        strategy_version: '1.0',
        starting_capital: formData.startingCapital,
        max_concurrent_positions: formData.maxConcurrentPositions,
        params: strategyParams,
        seed: Math.floor(Math.random() * 1000000)
      };

      const res = await fetch('/api/fake-trader/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      setNotification({type: 'success', message: `Fake trader started successfully! Run ID: ${result.run_id}`});
      
      // Refresh the runs list
      try {
        await fetchRuns();
      } catch (refreshError) {
        setNotification({type: 'error', message: 'Fake trader was created but failed to refresh the runs list. Please refresh the page.'});
      }
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to start fake trader: ${e.message}`});
    } finally {
      setLoading(false);
    }
  }

  async function toggleRunStatus(runId: string, newStatus: string) {
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
      setNotification({type: 'success', message: result.message});
      
      // Refresh runs list
      await fetchRuns();
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to ${newStatus} run: ${e.message}`});
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

  async function deleteFakeTraderRun(runId: string) {
    setDeletingRunId(runId);
    try {
      const res = await fetch(`/api/fake-trader/runs?run_id=${runId}`, {
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
      }
      
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to delete fake trader run: ${e.message}`});
    } finally {
      setDeletingRunId(null);
      setShowDeleteConfirm(null);
    }
  }

  async function deleteAllFakeTraderRuns() {
    setDeletingAll(true);
    try {
      const res = await fetch('/api/fake-trader/runs?all=true', {
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
      
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to delete all fake trader runs: ${e.message}`});
    } finally {
      setDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  }

  useEffect(() => {
    fetchSymbols();
    fetchRuns();
  }, []);

  // Poll for status updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if there are active runs
      const hasActiveRuns = runs.some(run => run.status === 'active');
      if (hasActiveRuns) {
        fetchRuns();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runs]);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const activeRuns = runs.filter(run => run.status === 'active');
  const inactiveRuns = runs.filter(run => run.status !== 'active');

  return (
    <main className="space-y-6">
      <h2 className="text-2xl font-bold">Fake Trader</h2>

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
        {/* Create Fake Trader Form */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-lg font-semibold mb-4">Start New Fake Trader</h3>
          
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
                placeholder="Fake trader name..."
              />
              {validationErrors.name && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
              )}
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
              <p className="text-xs text-sub mt-1">Amount of capital to start with (minimum $1,000)</p>
            </div>

            {/* Max Concurrent Positions */}
            <div>
              <label className="block text-sm font-medium mb-1">Max Concurrent Positions *</label>
              <input
                type="number"
                min="1"
                max="10"
                className={`w-full bg-bg border rounded px-3 py-2 ${
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
                <option value="1m">1 Minute (Fastest signals)</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes (Recommended)</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
              </select>
              <p className="text-xs text-sub mt-1">
                {formData.timeframe === '1m'
                  ? 'Fastest signals but more noise and frequent trading'
                  : 'Fake trader runs every 15 minutes, so 15m timeframe is recommended'
                }
              </p>
            </div>

            {/* Strategy Parameters - Same as backtest form but condensed */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3">Strategy Parameters</h4>
              
              {/* Basic Momentum Strategy Parameters */}
              {formData.strategy === 'momentum_breakout_v2' && (
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

            <button
              onClick={submitFakeTrader}
              disabled={loading}
              className={clsx(
                'w-full py-2 px-4 rounded font-medium',
                loading 
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {loading ? 'Starting Fake Trader...' : 'Start Fake Trader'}
            </button>
          </div>
        </div>

        {/* Fake Trader Runs */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold mb-4">Trading Runs</h3>
          
          {/* Active Runs */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-green-400 mb-2">🟢 Active Runs ({activeRuns.length})</h4>
            {activeRuns.length > 0 ? (
              <div className="space-y-2">
                {activeRuns.map(run => {
                  const { pnl, pnlPercent } = calculatePnL(run.starting_capital, run.current_capital);
                  return (
                    <div
                      key={run.run_id}
                      className={clsx(
                        'p-3 border rounded cursor-pointer transition-colors',
                        selectedRunId === run.run_id 
                          ? 'border-green-500 bg-green-500/10' 
                          : 'border-green-500/50 bg-green-500/5 hover:border-green-500'
                      )}
                      onClick={() => {
                        setSelectedRunId(selectedRunId === run.run_id ? null : run.run_id);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                          <div className="text-xs text-sub">
                            {run.symbols.length} symbols • {run.strategy_name}
                          </div>
                          <div className="text-xs mt-1">
                            <span className="text-sub">Capital: </span>
                            <span className="font-medium">{formatCapital(run.current_capital)}</span>
                            <span className={clsx(
                              'ml-2 font-medium',
                              pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            )}>
                              {pnl >= 0 ? '+' : ''}{formatCapital(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                            {run.status}
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRunStatus(run.run_id, 'paused');
                              }}
                              className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 rounded"
                            >
                              ⏸
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRunStatus(run.run_id, 'stopped');
                              }}
                              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                            >
                              ⏹
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {selectedRunId === run.run_id && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="text-sm space-y-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-sub">Started:</span>
                                <div className="font-medium text-xs">{formatTimestamp(run.started_at)}</div>
                              </div>
                              <div>
                                <span className="text-sub">Last Update:</span>
                                <div className="font-medium text-xs">{formatTimestamp(run.last_update)}</div>
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
                            
                            <div className="flex justify-end mt-4 pt-3 border-t border-border/50">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/fake-trader/${run.run_id}`, '_blank');
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
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-sub py-4 text-sm">
                No active runs
              </div>
            )}
          </div>

          {/* Recent Runs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-400">
                ⏸ Recent Runs ({inactiveRuns.length})
              </h4>
              {runs.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  disabled={deletingAll}
                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded transition-colors"
                  title="Delete all fake trader runs"
                >
                  {deletingAll ? 'Deleting...' : 'Delete All'}
                </button>
              )}
            </div>
            {inactiveRuns.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {inactiveRuns.map(run => {
                const { pnl, pnlPercent } = calculatePnL(run.starting_capital, run.current_capital);
                return (
                  <div
                    key={run.run_id}
                    className={clsx(
                      'p-3 border rounded cursor-pointer transition-colors',
                      selectedRunId === run.run_id 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-border hover:border-gray-500'
                    )}
                    onClick={() => {
                      setSelectedRunId(selectedRunId === run.run_id ? null : run.run_id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                        <div className="text-xs text-sub">
                          {run.symbols.length} symbols • {run.strategy_name} • 
                          {formatTimestamp(run.started_at)}
                        </div>
                        <div className="text-xs mt-1">
                          <span className="text-sub">Final: </span>
                          <span className="font-medium">{formatCapital(run.current_capital)}</span>
                          <span className={clsx(
                            'ml-2 font-medium',
                            pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          )}>
                            {pnl >= 0 ? '+' : ''}{formatCapital(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={clsx(
                          'px-2 py-1 rounded text-xs font-medium',
                          run.status === 'paused' && 'bg-yellow-500/20 text-yellow-400',
                          run.status === 'stopped' && 'bg-gray-500/20 text-gray-400',
                          run.status === 'error' && 'bg-red-500/20 text-red-400'
                        )}>
                          {run.status}
                        </span>
                        {run.status === 'paused' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRunStatus(run.run_id, 'active');
                            }}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded"
                          >
                            ▶
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {selectedRunId === run.run_id && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-sm space-y-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-sub">Started:</span>
                              <div className="font-medium text-xs">{formatTimestamp(run.started_at)}</div>
                            </div>
                            <div>
                              <span className="text-sub">Stopped:</span>
                              <div className="font-medium text-xs">
                                {run.stopped_at ? formatTimestamp(run.stopped_at) : 'N/A'}
                              </div>
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

                          {run.status === 'error' && run.error && (
                            <div>
                              <span className="text-sub text-red-400">Error:</span>
                              <div className="mt-1 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                                {run.error}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border/50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/fake-trader/${run.run_id}`, '_blank');
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                            >
                              View Details
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteConfirm({runId: run.run_id, name: run.name || 'Unnamed'});
                              }}
                              disabled={deletingRunId !== null}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded text-sm font-medium transition-colors"
                            >
                              {deletingRunId === run.run_id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="text-center text-sub py-4 text-sm">
                No recent runs. Start your first fake trader above!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onKeyDown={(e) => e.key === 'Escape' && setShowDeleteConfirm(null)}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Fake Trader Run</h3>
            <p className="text-sm text-sub mb-6">
              Are you sure you want to delete "<span className="font-medium text-white">{showDeleteConfirm.name}</span>"? 
              <br />
              <span className="text-red-400">This will permanently remove all associated data including trades, positions, and results.</span>
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
                onClick={() => deleteFakeTraderRun(showDeleteConfirm.runId)}
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
            <h3 className="text-lg font-semibold mb-4">Delete All Fake Trader Runs</h3>
            <p className="text-sm text-sub mb-6">
              Are you sure you want to delete <span className="font-medium text-white">all {runs.length} fake trader runs</span>? 
              <br />
              <span className="text-red-400">This will permanently remove all fake trader data including trades, positions, and results for every run.</span>
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
                onClick={deleteAllFakeTraderRuns}
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
    </main>
  );
}



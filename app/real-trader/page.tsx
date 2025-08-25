'use client';

import { useEffect, useState } from 'react';
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

export default function RealTraderPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [runs, setRuns] = useState<RealTradeRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    selectedSymbols: [] as string[],
    strategy: 'momentum_breakout_v2',
    timeframe: '15m',
    
    // Capital settings
    startingCapital: 1000, // Lower default for real trading
    maxConcurrentPositions: 2, // More conservative
    maxPositionSizeUsd: 200, // Conservative position size
    
    // Risk management
    dailyLossLimitPct: 3.0, // Conservative daily loss limit
    maxDrawdownPct: 8.0, // Conservative drawdown limit
    
    // Environment
    testnet: true, // Always default to testnet for safety
    
    // Basic Strategy parameters (momentum_breakout, momentum_breakout_v2)
    minRoc5m: 1.5, // Slightly more conservative
    minVolMult: 3.5,
    maxSpreadBps: 8,
    
    // Risk Management
    riskPerTrade: 0.25, // More conservative
    atrPeriod: 14,
    atrMultiplier: 2.0,
    partialTakeLevel: 1.5,
    partialTakePercent: 40,
    trailAfterPartial: true,
    
    // Guards
    minBookImbalance: 1.3,
    avoidFundingMinute: true,
    killSwitchPercent: 1.5,
    
    // Execution parameters
    feeBps: 4,
    slippageBps: 3,
    leverage: 1, // No leverage for safety
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
      const res = await fetch('/api/real-trader/runs', { cache: 'no-store' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRuns(data.runs || []);
      
      // Debug log to see what we're getting
      console.log('Real trader runs fetched:', data.runs?.length || 0, 'runs');
    } catch (e: any) {
      console.error('Failed to fetch real trader runs:', e);
      setNotification({type: 'error', message: `Failed to fetch real trader runs: ${e.message}`});
      // Still set runs to empty array to prevent issues
      setRuns([]);
    }
  }

  function validateForm() {
    const errors: Record<string, string> = {};

    // Validate name
    if (!formData.name.trim()) {
      errors.name = 'Real trader name is required';
    }

    // Validate symbols selection
    if (formData.selectedSymbols.length === 0) {
      errors.symbols = 'At least one symbol must be selected';
    }

    // Validate starting capital
    if (formData.startingCapital <= 0) {
      errors.startingCapital = 'Starting capital must be greater than 0';
    }
    if (formData.startingCapital < 100) {
      errors.startingCapital = 'Starting capital should be at least $100 for real trading';
    }
    if (formData.startingCapital > 100000) {
      errors.startingCapital = 'Starting capital cannot exceed $100,000 for safety';
    }

    // Validate position size
    if (formData.maxPositionSizeUsd <= 0) {
      errors.maxPositionSizeUsd = 'Max position size must be greater than 0';
    }
    if (formData.maxPositionSizeUsd > formData.startingCapital) {
      errors.maxPositionSizeUsd = 'Max position size cannot exceed starting capital';
    }

    // Validate risk limits
    if (formData.dailyLossLimitPct <= 0 || formData.dailyLossLimitPct > 20) {
      errors.dailyLossLimitPct = 'Daily loss limit must be between 0.1% and 20%';
    }
    if (formData.maxDrawdownPct <= 0 || formData.maxDrawdownPct > 50) {
      errors.maxDrawdownPct = 'Max drawdown must be between 0.1% and 50%';
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

    // Validate common parameters
    if (formData.maxSpreadBps < 0) {
      errors.maxSpreadBps = 'Max Spread cannot be negative';
    }

    // Validate execution parameters
    if (formData.leverage < 1) {
      errors.leverage = 'Leverage must be at least 1';
    }
    if (formData.leverage > 3) {
      errors.leverage = 'Leverage should not exceed 3x for real trading safety';
    }

    // Safety check for mainnet
    if (!formData.testnet) {
      if (formData.startingCapital > 10000) {
        errors.startingCapital = 'For mainnet trading, starting capital is limited to $10,000 for safety';
      }
      if (formData.leverage > 2) {
        errors.leverage = 'For mainnet trading, leverage is limited to 2x for safety';
      }
    }

    return errors;
  }

  async function submitRealTrader() {
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    // Extra safety confirmation for mainnet
    if (!formData.testnet) {
      const confirmed = window.confirm(
        '⚠️ WARNING: You are about to start REAL MONEY trading on Binance MAINNET!\n\n' +
        'This will execute actual trades with real money. Are you absolutely sure?\n\n' +
        'Click OK only if you:\n' +
        '• Have tested this strategy thoroughly on testnet\n' +
        '• Understand you can lose money\n' +
        '• Have proper API keys configured\n' +
        '• Accept full responsibility for losses'
      );
      
      if (!confirmed) {
        setNotification({type: 'warning', message: 'Real trading cancelled for safety'});
        return;
      }
    }

    setLoading(true);
    try {
      // Build strategy-specific parameters
      let strategyParams: any = {
        maxSpreadBps: formData.maxSpreadBps,
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
          // Risk Management
          riskPerTrade: formData.riskPerTrade / 100, // Convert percentage to decimal
          atrPeriod: formData.atrPeriod,
          atrMultiplier: formData.atrMultiplier,
          partialTakeLevel: formData.partialTakeLevel,
          partialTakePercent: formData.partialTakePercent / 100,
          trailAfterPartial: formData.trailAfterPartial,
          
          // Guards
          minBookImbalance: formData.minBookImbalance,
          avoidFundingMinute: formData.avoidFundingMinute,
          killSwitchPercent: formData.killSwitchPercent / 100,
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
        max_position_size_usd: formData.maxPositionSizeUsd,
        daily_loss_limit_pct: formData.dailyLossLimitPct,
        max_drawdown_pct: formData.maxDrawdownPct,
        testnet: formData.testnet,
        params: strategyParams,
        seed: Math.floor(Math.random() * 1000000)
      };

      const res = await fetch('/api/real-trader/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const result = await res.json();
      const modeText = result.testnet ? 'TESTNET' : 'MAINNET';
      setNotification({
        type: 'success', 
        message: `Real trader started successfully on ${modeText}! Run ID: ${result.run_id}`
      });
      
      // Refresh the runs list
      try {
        await fetchRuns();
      } catch (refreshError) {
        setNotification({type: 'error', message: 'Real trader was created but failed to refresh the runs list. Please refresh the page.'});
      }
    } catch (e: any) {
      setNotification({type: 'error', message: `Failed to start real trader: ${e.message}`});
    } finally {
      setLoading(false);
    }
  }

  async function toggleRunStatus(runId: string, newStatus: string) {
    // Extra safety for real trading
    if (newStatus === 'active') {
      const run = runs.find(r => r.run_id === runId);
      const modeText = run?.testnet ? 'TESTNET' : 'MAINNET';
      const confirmed = window.confirm(
        `⚠️ Are you sure you want to resume real trading on ${modeText}?\n\n` +
        'This will execute actual trades with real money.'
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

  useEffect(() => {
    fetchSymbols();
    fetchRuns();
  }, []);

  // Poll for status updates every 10 seconds (less frequent for real trading)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if there are active runs
      const hasActiveRuns = runs.some(run => run.status === 'active');
      if (hasActiveRuns) {
        fetchRuns();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [runs]);

  // Auto-dismiss notification after 8 seconds (longer for important real trading notifications)
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const activeRuns = runs.filter(run => run.status === 'active');
  const inactiveRuns = runs.filter(run => run.status !== 'active');

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-orange-400">Real Trader</h2>
        <span className="px-3 py-1 text-sm bg-red-500/20 border border-red-500/50 rounded-full text-red-300">
          ⚠️ REAL MONEY TRADING
        </span>
      </div>

      {/* Safety Warning */}
      <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
        <h3 className="text-lg font-semibold text-orange-400 mb-2">⚠️ Important Safety Notice</h3>
        <div className="text-sm text-orange-200 space-y-2">
          <p><strong>This executes REAL trades with REAL money on Binance Futures.</strong></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <p className="font-medium">✅ Before using Real Trader:</p>
              <ul className="text-xs mt-1 space-y-1 list-disc list-inside">
                <li>Test thoroughly with Backtest Worker</li>
                <li>Validate with Fake Trader simulation</li>
                <li>Start with TESTNET only</li>
                <li>Use small amounts initially</li>
                <li>Set conservative risk limits</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">❌ Never:</p>
              <ul className="text-xs mt-1 space-y-1 list-disc list-inside">
                <li>Risk money you can't afford to lose</li>
                <li>Use high leverage without experience</li>
                <li>Leave trades unmonitored</li>
                <li>Skip testnet validation</li>
                <li>Trade without proper API setup</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Real Trader Form */}
        <div className="rounded-xl border border-orange-500/30 bg-card p-4">
          <h3 className="text-lg font-semibold mb-4 text-orange-400">Start New Real Trader</h3>
          
          <div className="space-y-4">
            {/* Environment Selection - PROMINENT */}
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <label className="block text-sm font-medium mb-2 text-orange-300">Trading Environment *</label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="environment"
                    checked={formData.testnet}
                    onChange={() => setFormData(prev => ({ ...prev, testnet: true }))}
                    className="mr-2"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-green-400">🧪 TESTNET</span>
                    <span className="text-gray-400 ml-2">(Recommended - Fake money, real market)</span>
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="environment"
                    checked={!formData.testnet}
                    onChange={() => setFormData(prev => ({ ...prev, testnet: false }))}
                    className="mr-2"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-red-400">💰 MAINNET</span>
                    <span className="text-red-300 ml-2">(REAL MONEY - Experienced traders only)</span>
                  </span>
                </label>
              </div>
            </div>

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
                placeholder="Real trader name..."
              />
              {validationErrors.name && (
                <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
              )}
            </div>

            {/* Capital Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Starting Capital ($) *</label>
                <input
                  type="number"
                  step="100"
                  min="100"
                  max={formData.testnet ? "100000" : "10000"}
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
                  placeholder="1000"
                />
                {validationErrors.startingCapital && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.startingCapital}</p>
                )}
                <p className="text-xs text-sub mt-1">
                  Minimum $100, Max: {formData.testnet ? '$100K (testnet)' : '$10K (mainnet)'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Max Position Size ($) *</label>
                <input
                  type="number"
                  step="50"
                  min="50"
                  className={`w-full bg-bg border rounded px-3 py-2 ${
                    validationErrors.maxPositionSizeUsd ? 'border-red-500' : 'border-border'
                  }`}
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
                <p className="text-xs text-sub mt-1">Per-position limit</p>
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
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.dailyLossLimitPct ? 'border-red-500' : 'border-border'
                    }`}
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
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      validationErrors.maxDrawdownPct ? 'border-red-500' : 'border-border'
                    }`}
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

            {/* Strategy Parameters - Simplified for real trading */}
            {(formData.strategy === 'momentum_breakout' || formData.strategy === 'momentum_breakout_v2') && (
              <div className="border-t border-border pt-4">
                <h4 className="font-medium mb-3">Strategy Parameters</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-sub mb-1">Min ROC 5m (%) *</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
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
                      min="1"
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
                    max={formData.testnet ? "5" : "3"}
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
                  <p className="text-xs text-sub mt-1">
                    Max: {formData.testnet ? '5x (testnet)' : '3x (mainnet)'}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={submitRealTrader}
              disabled={loading}
              className={clsx(
                'w-full py-3 px-4 rounded font-medium text-lg',
                loading 
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : formData.testnet
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              )}
            >
              {loading 
                ? 'Starting Real Trader...' 
                : `Start Real Trader (${formData.testnet ? 'TESTNET' : 'MAINNET'})`
              }
            </button>
            
            {!formData.testnet && (
              <p className="text-red-300 text-xs text-center">
                ⚠️ MAINNET trading uses real money. Start with testnet first!
              </p>
            )}
          </div>
        </div>

        {/* Real Trader Runs */}
        <div className="rounded-xl border border-orange-500/30 bg-card p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold mb-4 text-orange-400">Trading Runs</h3>
          
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
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                            <span className={clsx(
                              'px-2 py-1 rounded text-xs font-medium',
                              run.testnet 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : 'bg-red-500/20 text-red-400'
                            )}>
                              {run.testnet ? '🧪 TESTNET' : '💰 MAINNET'}
                            </span>
                          </div>
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
                              title="Pause (keep positions, stop new trades)"
                            >
                              ⏸
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRunStatus(run.run_id, 'winding_down');
                              }}
                              className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 rounded"
                              title="Wind down (close positions, stop new trades)"
                            >
                              📉
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRunStatus(run.run_id, 'stopped');
                              }}
                              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                              title="Stop immediately"
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
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-sub">Max Position:</span>
                                <div className="font-medium text-xs">{formatCapital(run.max_position_size_usd)}</div>
                              </div>
                              <div>
                                <span className="text-sub">Daily Loss Limit:</span>
                                <div className="font-medium text-xs">{run.daily_loss_limit_pct}%</div>
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
                                  window.open(`/real-trader/${run.run_id}`, '_blank');
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
            <h4 className="text-sm font-medium text-gray-400 mb-2">
              ⏸ Recent Runs ({inactiveRuns.length})
            </h4>
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
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm">{run.name || 'Unnamed'}</div>
                          <span className={clsx(
                            'px-2 py-1 rounded text-xs font-medium',
                            run.testnet 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : 'bg-red-500/20 text-red-400'
                          )}>
                            {run.testnet ? '🧪 TESTNET' : '💰 MAINNET'}
                          </span>
                        </div>
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
                          run.status === 'winding_down' && 'bg-orange-500/20 text-orange-400',
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
                            title="Resume trading"
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
                          
                          <div className="flex justify-end mt-4 pt-3 border-t border-border/50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/real-trader/${run.run_id}`, '_blank');
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
                No recent runs. Start your first real trader above!
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
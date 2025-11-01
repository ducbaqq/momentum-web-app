'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

// Import reusable components
import { SymbolSelector, TimeframeSelector, StartingCapitalInput, MomentumBreakoutV2Params, ExecutionSettings } from '@/components/forms';
import { NotificationBanner } from '@/components/ui';
import { useSymbolManagement, useFormValidation } from '@/components/hooks';

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
  // Symbol management using custom hook
  const symbolManager = useSymbolManagement();

  const [runs, setRuns] = useState<RealTradeRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{runId: string, name: string} | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Form validation rules
  const validationRules = {
    name: (value: string) => value.trim() ? null : 'Real trader name is required',
    startingCapital: (value: number) => value >= 1000 ? null : 'Minimum capital is $1,000',
    maxConcurrentPositions: (value: number) => value > 0 && value <= 10 ? null : 'Max concurrent positions must be between 1 and 10',
    minRoc5m: (value: number) => value > 0 ? null : 'Min ROC must be greater than 0',
    minVolMult: (value: number) => value > 0 ? null : 'Min volume multiplier must be greater than 0',
    maxSpreadBps: (value: number) => value >= 0 ? null : 'Max spread must be non-negative',
    leverage: (value: number) => value >= 1 && value <= 100 ? null : 'Leverage must be between 1 and 100',
    riskPct: (value: number) => value > 0 && value <= 100 ? null : 'Risk per trade must be between 0 and 100%',
    stopLossPct: (value: number) => value > 0 && value <= 50 ? null : 'Stop loss must be between 0 and 50%',
    takeProfitPct: (value: number) => value > 0 && value <= 500 ? null : 'Take profit must be between 0 and 500%',
    feeBps: (value: number) => value >= 0 ? null : 'Fee must be non-negative',
    slippageBps: (value: number) => value >= 0 ? null : 'Slippage must be non-negative',
    symbols: (value: string[]) => value.length > 0 ? null : 'At least one symbol must be selected',
    maxPositionSizeUsd: (value: number) => value > 0 ? null : 'Max position size must be greater than 0',
    dailyLossLimitPct: (value: number) => value > 0 && value <= 100 ? null : 'Daily loss limit must be between 0 and 100%',
    maxDrawdownPct: (value: number) => value > 0 && value <= 100 ? null : 'Max drawdown must be between 0 and 100%',
  };

  const formValidation = useFormValidation(validationRules);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    timeframe: '15m',

    // Capital settings
    startingCapital: 1000,
    maxConcurrentPositions: 2, // More conservative for real trading
    maxPositionSizeUsd: 500, // Conservative position size for real trading

    // Risk management (real trading specific)
    dailyLossLimitPct: 5.0, // Conservative daily loss limit
    maxDrawdownPct: 10.0, // Conservative drawdown limit

    // Environment
    testnet: true, // Always default to testnet for safety

    // Basic Strategy parameters (momentum_breakout_v2) - OPTIMIZED DEFAULTS
    minRoc5m: 0.306, // Optimized: 30.6% ROC threshold
    minVolMult: 0.3,  // Optimized: 0.3x volume multiplier
    maxSpreadBps: 25,  // Optimized: 25bps spread limit
    leverage: 19,      // Optimized: 19x leverage (from market-sentry)
    riskPct: 1,        // Conservative: 1% risk per trade for real trading (enter as whole number)
    stopLossPct: 2,    // Conservative: 2% stop loss for real trading (enter as whole number)
    takeProfitPct: 10, // Conservative: 10% take profit for real trading (enter as whole number)

    // Execution parameters
    feeBps: 4,
    slippageBps: 2,
  });

  // Symbol fetching is handled by useSymbolManagement hook

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


  async function submitRealTrader() {
    // Use the form validation hook
    const errors = formValidation.validateAll({
      ...formData,
      symbols: symbolManager.selectedSymbols
    });

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
        setNotification({type: 'error', message: 'Real trading cancelled for safety'});
        return;
      }
    }

    setLoading(true);
    try {

      // Convert percentage parameters from whole numbers to decimals
      const processedParams = {
        minRoc5m: formData.minRoc5m > 1 ? formData.minRoc5m / 100 : formData.minRoc5m,
        minVolMult: formData.minVolMult,
        maxSpreadBps: formData.maxSpreadBps,
        leverage: formData.leverage,
        riskPct: formData.riskPct > 1 ? formData.riskPct / 100 : formData.riskPct,
        stopLossPct: formData.stopLossPct > 1 ? formData.stopLossPct / 100 : formData.stopLossPct,
        takeProfitPct: formData.takeProfitPct > 1 ? formData.takeProfitPct / 100 : formData.takeProfitPct,
        feeBps: formData.feeBps,
        slippageBps: formData.slippageBps
      };

      const payload = {
        name: formData.name,
        symbols: symbolManager.selectedSymbols,
        timeframe: formData.timeframe,
        strategy_name: 'momentum_breakout_v2',
        strategy_version: '1.0',
        starting_capital: formData.startingCapital,
        max_concurrent_positions: formData.maxConcurrentPositions,
        max_position_size_usd: formData.maxPositionSizeUsd,
        daily_loss_limit_pct: formData.dailyLossLimitPct,
        max_drawdown_pct: formData.maxDrawdownPct,
        testnet: formData.testnet,
        params: processedParams,
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
                  formValidation.errors.name ? 'border-red-500' : 'border-border'
                }`}
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                }}
                placeholder="Real trader name..."
              />
              {formValidation.errors.name && (
                <p className="text-red-500 text-xs mt-1">{formValidation.errors.name}</p>
              )}
            </div>

            {/* Symbol Selection */}
            <SymbolSelector
              symbols={symbolManager.symbols}
              selectedSymbols={symbolManager.selectedSymbols}
              onToggleSymbol={symbolManager.toggleSymbol}
              onSelectAll={symbolManager.selectAllSymbols}
              onClearAll={symbolManager.clearAllSymbols}
              validationError={formValidation.errors.symbols}
            />

            {/* Timeframe Selection */}
            <TimeframeSelector
              value={formData.timeframe}
              onChange={(timeframe) => setFormData(prev => ({ ...prev, timeframe }))}
            />

            {/* Capital Settings */}
            <StartingCapitalInput
              value={formData.startingCapital}
              onChange={(startingCapital) => setFormData(prev => ({ ...prev, startingCapital }))}
              validationError={formValidation.errors.startingCapital}
            />

            {/* Max Concurrent Positions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Concurrent Positions *</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  className={`w-full bg-bg border rounded px-3 py-2 ${
                    formValidation.errors.maxConcurrentPositions ? 'border-red-500' : 'border-border'
                  }`}
                  value={formData.maxConcurrentPositions}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxConcurrentPositions: parseInt(e.target.value) || 1 }))}
                />
                {formValidation.errors.maxConcurrentPositions && (
                  <p className="text-red-500 text-xs mt-1">{formValidation.errors.maxConcurrentPositions}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Position Size ($) *</label>
                <input
                  type="number"
                  step="50"
                  min="50"
                  className={`w-full bg-bg border rounded px-3 py-2 ${
                    formValidation.errors.maxPositionSizeUsd ? 'border-red-500' : 'border-border'
                  }`}
                  value={formData.maxPositionSizeUsd}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxPositionSizeUsd: parseFloat(e.target.value) || 0 }))}
                  placeholder="500"
                />
                {formValidation.errors.maxPositionSizeUsd && (
                  <p className="text-red-500 text-xs mt-1">{formValidation.errors.maxPositionSizeUsd}</p>
                )}
              </div>
            </div>

            {/* Risk Management */}
            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3 text-orange-300">Risk Management</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-sub mb-1">Daily Loss Limit (%) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="20"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      formValidation.errors.dailyLossLimitPct ? 'border-red-500' : 'border-border'
                    }`}
                    value={formData.dailyLossLimitPct}
                    onChange={(e) => setFormData(prev => ({ ...prev, dailyLossLimitPct: parseFloat(e.target.value) || 0 }))}
                  />
                  {formValidation.errors.dailyLossLimitPct && (
                    <p className="text-red-500 text-xs mt-1">{formValidation.errors.dailyLossLimitPct}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-sub mb-1">Max Drawdown (%) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="50"
                    className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                      formValidation.errors.maxDrawdownPct ? 'border-red-500' : 'border-border'
                    }`}
                    value={formData.maxDrawdownPct}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxDrawdownPct: parseFloat(e.target.value) || 0 }))}
                  />
                  {formValidation.errors.maxDrawdownPct && (
                    <p className="text-red-500 text-xs mt-1">{formValidation.errors.maxDrawdownPct}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Momentum Breakout V2 Parameters */}
            <MomentumBreakoutV2Params
              minRoc5m={formData.minRoc5m}
              minVolMult={formData.minVolMult}
              maxSpreadBps={formData.maxSpreadBps}
              leverage={formData.leverage}
              riskPct={formData.riskPct}
              stopLossPct={formData.stopLossPct}
              takeProfitPct={formData.takeProfitPct}
              onMinRoc5mChange={(minRoc5m) => setFormData(prev => ({ ...prev, minRoc5m }))}
              onMinVolMultChange={(minVolMult) => setFormData(prev => ({ ...prev, minVolMult }))}
              onMaxSpreadBpsChange={(maxSpreadBps) => setFormData(prev => ({ ...prev, maxSpreadBps }))}
              onLeverageChange={(leverage) => setFormData(prev => ({ ...prev, leverage }))}
              onRiskPctChange={(riskPct) => setFormData(prev => ({ ...prev, riskPct }))}
              onStopLossPctChange={(stopLossPct) => setFormData(prev => ({ ...prev, stopLossPct }))}
              onTakeProfitPctChange={(takeProfitPct) => setFormData(prev => ({ ...prev, takeProfitPct }))}
              validationErrors={{
                minRoc5m: formValidation.errors.minRoc5m,
                minVolMult: formValidation.errors.minVolMult,
                maxSpreadBps: formValidation.errors.maxSpreadBps,
                leverage: formValidation.errors.leverage,
                riskPct: formValidation.errors.riskPct,
                stopLossPct: formValidation.errors.stopLossPct,
                takeProfitPct: formValidation.errors.takeProfitPct
              }}
            />

            {/* Execution Parameters */}
            <ExecutionSettings
              feeBps={formData.feeBps}
              slippageBps={formData.slippageBps}
              leverage={formData.leverage}
              onFeeBpsChange={(feeBps) => setFormData(prev => ({ ...prev, feeBps }))}
              onSlippageBpsChange={(slippageBps) => setFormData(prev => ({ ...prev, slippageBps }))}
              onLeverageChange={(leverage) => setFormData(prev => ({ ...prev, leverage }))}
              validationErrors={{
                feeBps: formValidation.errors.feeBps,
                slippageBps: formValidation.errors.slippageBps,
                leverage: formValidation.errors.leverage
              }}
            />

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
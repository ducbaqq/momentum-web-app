'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

// Import reusable components
import { SymbolSelector, TimeframeSelector, StartingCapitalInput, MomentumBreakoutV2Params, ExecutionSettings } from '@/components/forms';
import { NotificationBanner } from '@/components/ui';
import { useSymbolManagement, useFormValidation } from '@/components/hooks';

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
  available_funds: number;
  max_concurrent_positions: number;
  started_at: string;
  last_update: string;
  stopped_at: string | null;
  error: string | null;
  created_at: string;
};

export default function FakeTraderPage() {
  // Symbol management using custom hook
  const symbolManager = useSymbolManagement();

  const [runs, setRuns] = useState<FakeTradeRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{runId: string, name: string} | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Form validation rules
  const validationRules = {
    name: (value: string) => value.trim() ? null : 'Fake trader name is required',
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
  };

  const formValidation = useFormValidation(validationRules);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    timeframe: '15m',

    // Capital settings
    startingCapital: 1000,
    maxConcurrentPositions: 3,

    // Basic Strategy parameters (momentum_breakout_v2) - OPTIMIZED DEFAULTS
    minRoc5m: 0.306, // Optimized: 30.6% ROC threshold
    minVolMult: 0.3,  // Optimized: 0.3x volume multiplier
    maxSpreadBps: 25,  // Optimized: 25bps spread limit
    leverage: 19,      // Optimized: 19x leverage (from market-sentry)
    riskPct: 2,        // Optimized: 2% risk per trade (enter as whole number)
    stopLossPct: 1,    // Optimized: 1% stop loss (enter as whole number)
    takeProfitPct: 15, // Optimized: 15% take profit (enter as whole number)

    // Execution parameters
    feeBps: 4,
    slippageBps: 2,
  });

  async function fetchSymbols() {
    try {
      const res = await fetch('/api/symbols', { cache: 'no-store' });
      const data = await res.json();
      symbolManager.updateSymbols(data.symbols || []);
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
    // Use the form validation hook with all current form data
    const formDataWithSymbols = {
      ...formData,
      symbols: symbolManager.selectedSymbols
    };

    const errors = formValidation.validateAll(formDataWithSymbols);

    // Additional capital validation
    if (formData.startingCapital > 10000000) {
      errors.startingCapital = 'Starting capital cannot exceed $10,000,000';
    }

    return errors;
  }

  async function submitFakeTrader() {
    const errors = validateForm();

    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      // Build momentum_breakout_v2 strategy parameters - OPTIMIZED DEFAULTS
      let strategyParams: any = {
        maxSpreadBps: formData.maxSpreadBps,
        starting_capital: formData.startingCapital,
        feeBps: formData.feeBps,
        slippageBps: formData.slippageBps,
        leverage: formData.leverage,
        minRoc5m: formData.minRoc5m,
        minVolMult: formData.minVolMult,
        riskPct: formData.riskPct,
        stopLossPct: formData.stopLossPct,
        takeProfitPct: formData.takeProfitPct
      };

      const payload = {
        name: formData.name,
        symbols: symbolManager.selectedSymbols,
        timeframe: formData.timeframe,
        strategy_name: 'momentum_breakout_v2',
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
        <NotificationBanner
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
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
                  formValidation.errors.name ? 'border-red-500' : 'border-border'
                }`}
                value={formData.name}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setFormData(prev => ({ ...prev, name: newValue }));
                  formValidation.validateField('name', newValue);
                }}
                placeholder="Fake trader name..."
              />
              {formValidation.errors.name && (
                <p className="text-red-500 text-xs mt-1">{formValidation.errors.name}</p>
              )}
            </div>

            {/* Starting Capital */}
            <StartingCapitalInput
              value={formData.startingCapital}
              onChange={(value) => setFormData(prev => ({ ...prev, startingCapital: value }))}
              validationError={formValidation.errors.startingCapital}
            />

            {/* Max Concurrent Positions */}
            <div>
              <label className="block text-sm font-medium mb-1">Max Concurrent Positions *</label>
              <input
                type="number"
                min="1"
                max="10"
                className={`w-full bg-bg border rounded px-3 py-2 ${
                  formValidation.errors.maxConcurrentPositions ? 'border-red-500' : 'border-border'
                }`}
                value={formData.maxConcurrentPositions}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value) || 0;
                  setFormData(prev => ({ ...prev, maxConcurrentPositions: newValue }));
                  formValidation.validateField('maxConcurrentPositions', newValue);
                }}
              />
              {formValidation.errors.maxConcurrentPositions && (
                <p className="text-red-500 text-xs mt-1">{formValidation.errors.maxConcurrentPositions}</p>
              )}
            </div>

            {/* Symbol Selection */}
            <SymbolSelector
              symbols={symbolManager.symbols}
              selectedSymbols={symbolManager.selectedSymbols}
              validationError={formValidation.errors.symbols}
              onToggleSymbol={symbolManager.toggleSymbol}
              onSelectAll={symbolManager.selectAllSymbols}
              onClearAll={symbolManager.clearAllSymbols}
            />



            {/* Timeframe Selection */}
            <TimeframeSelector
              value={formData.timeframe}
              onChange={(value) => setFormData(prev => ({ ...prev, timeframe: value }))}
              show1m={true}
              helpText={
                formData.timeframe === '1m'
                  ? 'Fastest signals but more noise and frequent trading'
                  : 'Fake trader runs every 15 minutes, so 15m timeframe is recommended'
              }
            />

            {/* Strategy Parameters */}
            <MomentumBreakoutV2Params
              minRoc5m={formData.minRoc5m}
              minVolMult={formData.minVolMult}
              maxSpreadBps={formData.maxSpreadBps}
              leverage={formData.leverage}
              riskPct={formData.riskPct}
              stopLossPct={formData.stopLossPct}
              takeProfitPct={formData.takeProfitPct}
              onMinRoc5mChange={(value) => setFormData(prev => ({ ...prev, minRoc5m: value }))}
              onMinVolMultChange={(value) => setFormData(prev => ({ ...prev, minVolMult: value }))}
              onMaxSpreadBpsChange={(value) => setFormData(prev => ({ ...prev, maxSpreadBps: value }))}
              onLeverageChange={(value) => setFormData(prev => ({ ...prev, leverage: value }))}
              onRiskPctChange={(value) => setFormData(prev => ({ ...prev, riskPct: value }))}
              onStopLossPctChange={(value) => setFormData(prev => ({ ...prev, stopLossPct: value }))}
              onTakeProfitPctChange={(value) => setFormData(prev => ({ ...prev, takeProfitPct: value }))}
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
              onFeeBpsChange={(value) => setFormData(prev => ({ ...prev, feeBps: value }))}
              onSlippageBpsChange={(value) => setFormData(prev => ({ ...prev, slippageBps: value }))}
              onLeverageChange={(value) => setFormData(prev => ({ ...prev, leverage: value }))}
              validationErrors={{
                feeBps: formValidation.errors.feeBps,
                slippageBps: formValidation.errors.slippageBps,
                leverage: formValidation.errors.leverage
              }}
            />

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
                            <span className="text-sub">Available: </span>
                            <span className="font-medium">{formatCapital(run.available_funds)}</span>
                            <span className="text-sub ml-2">Total: {formatCapital(run.current_capital)}</span>
                            <span className={clsx(
                              'ml-2 font-medium',
                              pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            )}>
                              {pnl >= 0 ? '+' : ''}{formatCapital(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
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

                            {run.params && (
                              <div>
                                <span className="text-sub">Parameters:</span>
                                <pre className="text-xs mt-1 bg-bg border border-border rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(run.params, null, 2)}
                                </pre>
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
                          <span className="text-sub">Available: </span>
                          <span className="font-medium">{formatCapital(run.available_funds)}</span>
                          <span className="text-sub ml-2">Total: {formatCapital(run.current_capital)}</span>
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

                          {run.params && (
                            <div>
                              <span className="text-sub">Parameters:</span>
                              <pre className="text-xs mt-1 bg-bg border border-border rounded p-2 overflow-x-auto max-h-32">
                                {JSON.stringify(run.params, null, 2)}
                              </pre>
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



'use client';

import React from 'react';

interface ExecutionSettingsProps {
  feeBps: number;
  slippageBps: number;
  leverage: number;
  onFeeBpsChange: (value: number) => void;
  onSlippageBpsChange: (value: number) => void;
  onLeverageChange: (value: number) => void;
  validationErrors?: {
    feeBps?: string;
    slippageBps?: string;
    leverage?: string;
  };
}

export function ExecutionSettings({
  feeBps,
  slippageBps,
  leverage,
  onFeeBpsChange,
  onSlippageBpsChange,
  onLeverageChange,
  validationErrors = {}
}: ExecutionSettingsProps) {
  return (
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
            value={feeBps}
            onChange={(e) => onFeeBpsChange(parseFloat(e.target.value) || 0)}
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
            value={slippageBps}
            onChange={(e) => onSlippageBpsChange(parseFloat(e.target.value) || 0)}
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
            value={leverage}
            onChange={(e) => onLeverageChange(parseFloat(e.target.value) || 1)}
          />
          {validationErrors.leverage && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.leverage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

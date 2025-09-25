'use client';

import React from 'react';

// Helper function to parse numbers with both comma and period decimal separators
const parseNumericInput = (value: string): number => {
  // Replace comma with period to handle European decimal notation
  const normalizedValue = value.replace(',', '.');
  const parsed = parseFloat(normalizedValue);
  return isNaN(parsed) ? 0 : parsed;
};

interface MomentumBreakoutV2ParamsProps {
  minRoc5m: number;
  minVolMult: number;
  maxSpreadBps: number;
  leverage: number;
  riskPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  onMinRoc5mChange: (value: number) => void;
  onMinVolMultChange: (value: number) => void;
  onMaxSpreadBpsChange: (value: number) => void;
  onLeverageChange: (value: number) => void;
  onRiskPctChange: (value: number) => void;
  onStopLossPctChange: (value: number) => void;
  onTakeProfitPctChange: (value: number) => void;
  validationErrors?: {
    minRoc5m?: string;
    minVolMult?: string;
    maxSpreadBps?: string;
    leverage?: string;
    riskPct?: string;
    stopLossPct?: string;
    takeProfitPct?: string;
  };
}

export function MomentumBreakoutV2Params({
  minRoc5m,
  minVolMult,
  maxSpreadBps,
  leverage,
  riskPct,
  stopLossPct,
  takeProfitPct,
  onMinRoc5mChange,
  onMinVolMultChange,
  onMaxSpreadBpsChange,
  onLeverageChange,
  onRiskPctChange,
  onStopLossPctChange,
  onTakeProfitPctChange,
  validationErrors = {}
}: MomentumBreakoutV2ParamsProps) {
  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-medium mb-3">Momentum Breakout V2 Parameters</h4>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-sub mb-1">Min ROC 5m (%) * <span className="text-xs opacity-70">(use . or , for decimals)</span></label>
            <input
              type="number"
              step="0.1"
              min="0"
              className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
                validationErrors.minRoc5m ? 'border-red-500' : 'border-border'
              }`}
              value={minRoc5m}
              onChange={(e) => onMinRoc5mChange(parseNumericInput(e.target.value))}
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
              value={minVolMult}
              onChange={(e) => onMinVolMultChange(parseNumericInput(e.target.value))}
            />
            {validationErrors.minVolMult && (
              <p className="text-red-500 text-xs mt-1">{validationErrors.minVolMult}</p>
            )}
          </div>
        </div>
      </div>

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
            value={maxSpreadBps}
            onChange={(e) => onMaxSpreadBpsChange(parseNumericInput(e.target.value))}
          />
          {validationErrors.maxSpreadBps && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.maxSpreadBps}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
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
            onChange={(e) => onLeverageChange(parseNumericInput(e.target.value))}
          />
          {validationErrors.leverage && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.leverage}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-sub mb-1">Risk per Trade (%) * <span className="text-xs opacity-70">(use . or , for decimals)</span></label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="50"
            className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
              validationErrors.riskPct ? 'border-red-500' : 'border-border'
            }`}
            value={riskPct}
            onChange={(e) => onRiskPctChange(parseNumericInput(e.target.value))}
          />
          {validationErrors.riskPct && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.riskPct}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label className="block text-xs text-sub mb-1">Stop Loss (%) * <span className="text-xs opacity-70">(use . or , for decimals)</span></label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="20"
            className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
              validationErrors.stopLossPct ? 'border-red-500' : 'border-border'
            }`}
            value={stopLossPct}
            onChange={(e) => onStopLossPctChange(parseNumericInput(e.target.value))}
          />
          {validationErrors.stopLossPct && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.stopLossPct}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-sub mb-1">Take Profit (%) * <span className="text-xs opacity-70">(use . or , for decimals)</span></label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="50"
            className={`w-full bg-bg border rounded px-2 py-1 text-sm ${
              validationErrors.takeProfitPct ? 'border-red-500' : 'border-border'
            }`}
            value={takeProfitPct}
            onChange={(e) => onTakeProfitPctChange(parseNumericInput(e.target.value))}
          />
          {validationErrors.takeProfitPct && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.takeProfitPct}</p>
          )}
        </div>
      </div>
    </div>
  );
}

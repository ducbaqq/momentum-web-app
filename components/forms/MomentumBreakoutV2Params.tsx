'use client';

import React from 'react';

interface MomentumBreakoutV2ParamsProps {
  minRoc5m: number;
  minVolMult: number;
  maxSpreadBps: number;
  onMinRoc5mChange: (value: number) => void;
  onMinVolMultChange: (value: number) => void;
  onMaxSpreadBpsChange: (value: number) => void;
  validationErrors?: {
    minRoc5m?: string;
    minVolMult?: string;
    maxSpreadBps?: string;
  };
}

export function MomentumBreakoutV2Params({
  minRoc5m,
  minVolMult,
  maxSpreadBps,
  onMinRoc5mChange,
  onMinVolMultChange,
  onMaxSpreadBpsChange,
  validationErrors = {}
}: MomentumBreakoutV2ParamsProps) {
  return (
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
              value={minRoc5m}
              onChange={(e) => onMinRoc5mChange(parseFloat(e.target.value) || 0)}
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
              onChange={(e) => onMinVolMultChange(parseFloat(e.target.value) || 0)}
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
            onChange={(e) => onMaxSpreadBpsChange(parseFloat(e.target.value) || 0)}
          />
          {validationErrors.maxSpreadBps && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.maxSpreadBps}</p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';

interface SymbolSelectorProps {
  symbols: string[];
  selectedSymbols: string[];
  validationError?: string;
  onToggleSymbol: (symbol: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function SymbolSelector({
  symbols,
  selectedSymbols,
  validationError,
  onToggleSymbol,
  onSelectAll,
  onClearAll
}: SymbolSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Symbols *</label>
      <div className="flex gap-2 mb-2">
        <button
          onClick={onSelectAll}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
        >
          Select All
        </button>
        <button
          onClick={onClearAll}
          className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded"
        >
          Clear All
        </button>
        <span className="text-xs text-sub self-center">
          ({selectedSymbols.length} selected)
        </span>
      </div>
      <div className={`grid grid-cols-3 gap-1 max-h-32 overflow-y-auto bg-bg border rounded p-2 ${
        validationError ? 'border-red-500' : 'border-border'
      }`}>
        {symbols.map(symbol => (
          <label key={symbol} className="flex items-center text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSymbols.includes(symbol)}
              onChange={() => onToggleSymbol(symbol)}
              className="mr-1"
            />
            {symbol}
          </label>
        ))}
      </div>
      {validationError && (
        <p className="text-red-500 text-xs mt-1">{validationError}</p>
      )}
    </div>
  );
}

'use client';

import React from 'react';

interface StartingCapitalInputProps {
  value: number;
  onChange: (value: number) => void;
  validationError?: string;
  label?: string;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function StartingCapitalInput({
  value,
  onChange,
  validationError,
  label = "Starting Capital ($)",
  helpText = "Amount of capital to start with (minimum $1,000)",
  min = 1000,
  max = 10000000,
  step = 1000
}: StartingCapitalInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label} *</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        className={`w-full bg-bg border rounded px-3 py-2 ${
          validationError ? 'border-red-500' : 'border-border'
        }`}
        value={value}
        onChange={(e) => {
          onChange(parseFloat(e.target.value) || 0);
        }}
        placeholder="10000"
      />
      {validationError && (
        <p className="text-red-500 text-xs mt-1">{validationError}</p>
      )}
      <p className="text-xs text-sub mt-1">{helpText}</p>
    </div>
  );
}

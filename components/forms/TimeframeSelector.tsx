'use client';

import React from 'react';

interface TimeframeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  show1m?: boolean; // Whether to show 1m option
  helpText?: string;
}

const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1 Minute', description: 'Fastest signals but more noise and frequent trading' },
  { value: '5m', label: '5 Minutes', description: 'Short-term momentum' },
  { value: '15m', label: '15 Minutes', description: 'Balanced approach - recommended' },
  { value: '30m', label: '30 Minutes', description: 'Medium-term trends' },
  { value: '1h', label: '1 Hour', description: 'Long-term momentum' },
  { value: '4h', label: '4 Hours', description: 'Very long-term trends' },
  { value: '1d', label: '1 Day', description: 'Daily timeframe' },
];

export function TimeframeSelector({
  value,
  onChange,
  show1m = true,
  helpText
}: TimeframeSelectorProps) {
  const filteredOptions = show1m ? TIMEFRAME_OPTIONS : TIMEFRAME_OPTIONS.slice(1);

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Timeframe</label>
      <select
        className="w-full bg-bg border border-border rounded px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {filteredOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-sub mt-1">
        {helpText || filteredOptions.find(opt => opt.value === value)?.description || 'Select timeframe for trading'}
      </p>
    </div>
  );
}

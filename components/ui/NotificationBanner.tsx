'use client';

import React from 'react';
import { clsx } from 'clsx';

interface NotificationBannerProps {
  type: 'success' | 'error';
  message: string;
  onClose?: () => void;
}

export function NotificationBanner({
  type,
  message,
  onClose
}: NotificationBannerProps) {
  return (
    <div className={clsx(
      'p-4 rounded-lg border flex items-center justify-between',
      type === 'success' && 'bg-green-500/10 border-green-500/20 text-green-400',
      type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400'
    )}>
      <span className="text-sm">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 text-xs opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

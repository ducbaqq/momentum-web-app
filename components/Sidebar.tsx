'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: '📊',
    description: 'Real-time momentum data'
  },
  {
    name: 'Details',
    href: '/details',
    icon: '🔍',
    description: 'Detailed analysis'
  },
  {
    name: 'Backtest',
    href: '/backtest',
    icon: '📈',
    description: 'Strategy testing'
  },
  {
    name: 'Fake Trader',
    href: '/fake-trader',
    icon: '🎭',
    description: 'Simulation trading'
  },
  {
    name: 'Real Trader',
    href: '/real-trader',
    icon: '💰',
    description: 'Live trading',
    highlight: true
  }
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className={clsx(
      'bg-slate-800/50 backdrop-blur-sm border-r border-slate-700/50 transition-all duration-300 flex flex-col',
      isCollapsed ? 'w-16' : 'w-64'
    )}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">MT</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Momentum</h1>
                <p className="text-xs text-slate-400">Trading Platform</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">MT</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                isActive
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white',
                isCollapsed && 'justify-center'
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.name}</span>
                    {item.highlight && (
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 group-hover:text-slate-300">
                    {item.description}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50">
        {!isCollapsed ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live Data</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>
    </div>
  );
}

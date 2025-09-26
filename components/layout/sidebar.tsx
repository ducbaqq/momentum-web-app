'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  BarChart3,
  TrendingUp,
  Bot,
  Activity,
  Settings,
  Home,
  Zap,
  Database,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home, current: true },
  { name: 'Market Data', href: '/details', icon: TrendingUp },
  { name: 'Backtest', href: '/backtest', icon: BarChart3 },
  { name: 'Fake Trader', href: '/fake-trader', icon: Bot },
  { name: 'Real Trader', href: '/real-trader', icon: Zap },
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Database', href: '/database', icon: Database },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-64 bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Momentum</h1>
            <p className="text-xs text-foreground-muted">Trading Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-foreground-secondary hover:bg-card-hover hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-foreground-muted text-center">
          Powered by Neon Postgres
        </div>
      </div>
    </div>
  );
}

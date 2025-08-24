import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crypto Momentum Dashboard',
  description: 'Real-time momentum dashboard powered by Neon Postgres',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <div className="max-w-6xl mx-auto p-4">
          <header className="flex items-center gap-3 mb-4">
            <h1 className="text-lg font-semibold">🚀 Crypto Momentum</h1>
            <nav className="ml-auto flex gap-2 text-sm">
              <a href="/" className="px-3 py-1 rounded-full border border-border bg-card hover:opacity-80">Home</a>
              <a href="/details" className="px-3 py-1 rounded-full border border-border bg-card hover:opacity-80">Details</a>
              <a href="/backtest" className="px-3 py-1 rounded-full border border-border bg-card hover:opacity-80">Backtest</a>
              <a href="/fake-trader" className="px-3 py-1 rounded-full border border-border bg-card hover:opacity-80">Fake Trader</a>
              <a href="/real-trader" className="px-3 py-1 rounded-full border border-border bg-card hover:opacity-80 text-orange-400 border-orange-500/50">Real Trader</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
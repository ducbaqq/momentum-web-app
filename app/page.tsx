'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { clsx } from 'clsx';

type LatestTick = {
  symbol: string;
  ts: string;
  close: string;
  roc1m: string | null;
  roc5m: string | null;
  vol: string | null;
  vol_avg: string | null;
  book_imb: string | null;
  signal?: boolean | null;
};

type MultiHorizonROC = {
  symbol: string;
  roc15m: number | null;
  roc30m: number | null;
  roc1h: number | null;
  roc4h: number | null;
};

type Signal = {
  ts: string;
  symbol: string;
  close: string;
  roc1m: string;
  roc5m: string;
  vol: string;
  vol_avg: string;
  book_imb: string;
  thresholds: Record<string, unknown> | null;
};

type FieldKey = '1m_roc' | '5m_roc' | '15m_roc' | '30m_roc' | '1h_roc' | '4h_roc' | 'volume' | 'vol_avg' | 'book_imbalance' | 'last_signal';

type FieldConfig = {
  [K in FieldKey]: boolean;
};

type FieldDefinition = {
  key: FieldKey;
  label: string;
  defaultVisible: boolean;
};

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: '1m_roc', label: '1m ROC', defaultVisible: true },
  { key: '5m_roc', label: '5m ROC', defaultVisible: true },
  { key: '15m_roc', label: '15m ROC', defaultVisible: true },
  { key: '30m_roc', label: '30m ROC', defaultVisible: true },
  { key: '1h_roc', label: '1h ROC', defaultVisible: true },
  { key: '4h_roc', label: '4h ROC', defaultVisible: true },
  { key: 'volume', label: 'Volume', defaultVisible: true },
  { key: 'vol_avg', label: 'Vol Avg', defaultVisible: true },
  { key: 'book_imbalance', label: 'Book Imbalance', defaultVisible: true },
  { key: 'last_signal', label: 'Last Signal', defaultVisible: true },
];

const getDefaultFieldConfig = (): FieldConfig => {
  return FIELD_DEFINITIONS.reduce((config, field) => {
    config[field.key] = field.defaultVisible;
    return config;
  }, {} as FieldConfig);
};

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS || process.env.REFRESH_MS || 5000);

export default function HomePage() {
  const [latest, setLatest] = useState<LatestTick[]>([]);
  const [signals, setSignals] = useState<Record<string, Signal | null>>({});
  const [symbols, setSymbols] = useState<string[]>([]);
  const [multiHorizonROC, setMultiHorizonROC] = useState<Record<string, MultiHorizonROC>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldConfigs, setFieldConfigs] = useState<Record<string, FieldConfig>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function fetchAll() {
    try {
      const [lRes, sRes, symRes] = await Promise.all([
        fetch('/api/ticks/latest', { cache: 'no-store' }),
        fetch('/api/signals/recent', { cache: 'no-store' }),
        fetch('/api/symbols', { cache: 'no-store' })
      ]);
      if (!lRes.ok) throw new Error('latest fetch failed');
      if (!sRes.ok) throw new Error('recent signals fetch failed');
      if (!symRes.ok) throw new Error('symbols fetch failed');

      const lData = await lRes.json();
      const sData: Signal[] = await sRes.json();
      const symData = await symRes.json();

      const availableSymbols = symData.symbols || [];
      const latestBySymbol: LatestTick[] = lData;
      const signalsBySymbol: Record<string, Signal | null> = {};

      for (const sym of availableSymbols) {
        const found = sData.find((x) => x.symbol === sym) || null;
        signalsBySymbol[sym] = found;
      }

      // Fetch multi-horizon ROC data for all symbols in parallel
      const rocPromises = availableSymbols.map(async (sym: string) => {
        try {
          const res = await fetch(`/api/ticks/${sym}`, { cache: 'no-store' });
          if (!res.ok) return { symbol: sym, roc15m: null, roc30m: null, roc1h: null, roc4h: null };
          const data = await res.json();
          return {
            symbol: sym,
            roc15m: data.roc15m,
            roc30m: data.roc30m,
            roc1h: data.roc1h,
            roc4h: data.roc4h
          };
        } catch {
          return { symbol: sym, roc15m: null, roc30m: null, roc1h: null, roc4h: null };
        }
      });

      const rocResults = await Promise.all(rocPromises);
      const rocBySymbol: Record<string, MultiHorizonROC> = {};
      rocResults.forEach(roc => {
        rocBySymbol[roc.symbol] = roc;
      });

      setSymbols(availableSymbols);
      setLatest(latestBySymbol);
      setSignals(signalsBySymbol);
      setMultiHorizonROC(rocBySymbol);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }

  const getFieldConfig = (symbol: string): FieldConfig => {
    return fieldConfigs[symbol] || getDefaultFieldConfig();
  };

  const updateFieldConfig = (symbol: string, field: FieldKey, visible: boolean) => {
    setFieldConfigs(prev => ({
      ...prev,
      [symbol]: {
        ...getFieldConfig(symbol),
        [field]: visible
      }
    }));
  };

  const toggleDropdown = (symbol: string) => {
    setOpenDropdown(openDropdown === symbol ? null : symbol);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Loading skeleton for symbol cards
  if (loading) {
    return (
      <main className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                borderRadius: '0.75rem',
                borderWidth: '1px',
                borderColor: 'rgb(32 37 43 / var(--tw-border-opacity))',
                backgroundColor: 'rgb(21 26 33 / var(--tw-bg-opacity))',
                padding: '0.75rem',
                borderStyle: 'solid',
                boxSizing: 'border-box'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="skeleton h-4 w-16"></div>
                <div className="skeleton h-4 w-12 rounded-full"></div>
              </div>
              <div className="skeleton h-6 w-20 mb-2"></div>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                {[...Array(6)].map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <div className="skeleton h-3 w-12"></div>
                    <div className="skeleton h-3 w-16"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      {error && (
        <div className="border border-red-500 text-red-400 bg-[#1a0f0f] p-3 rounded">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {symbols.map((sym) => {
          const row = latest.find((r) => r.symbol === sym);
          const sig = signals[sym];
          const rocData = multiHorizonROC[sym];
          const ts = row?.ts ? new Date(row.ts) : null;
          const price = row?.close ? Number(row.close) : null;
          const roc1 = row?.roc1m != null ? Number(row.roc1m) : null;
          const roc5 = row?.roc5m != null ? Number(row.roc5m) : null;
          const roc15 = rocData?.roc15m;
          const roc30 = rocData?.roc30m;
          const roc1h = rocData?.roc1h;
          const roc4h = rocData?.roc4h;
          const vol = row?.vol != null ? Number(row.vol) : null;
          const volAvg = row?.vol_avg != null ? Number(row.vol_avg) : null;
          const imb = row?.book_imb != null ? Number(row.book_imb) : null;

          // Calculate recent signal without useMemo to avoid hook count issues
          const recentSignal = (() => {
            if (!sig) return null;
            const ago = Date.now() - new Date(sig.ts).getTime();
            return ago <= 60 * 60 * 1000 ? sig : null; // within 1h
          })();

          return (
            <div key={sym} className={clsx(
              'rounded-xl border border-border bg-card p-3',
              recentSignal && 'ring-1 ring-green-500'
            )}>
              <div className="flex items-center justify-between mb-2">
                <a
                  href={`https://www.binance.com/en/futures/${sym}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:text-blue-400 hover:underline transition-colors"
                >
                  {sym}
                </a>
                <div className="flex items-center gap-2">
                  <div className="text-xs rounded-full border border-pillBorder bg-pill px-2 py-0.5">
                    {ts ? ts.toLocaleTimeString() : '—'}
                  </div>
                  <div className="relative" ref={openDropdown === sym ? dropdownRef : null}>
                    <button
                      onClick={() => toggleDropdown(sym)}
                      className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
                      title="More options"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="2" cy="8" r="1.5"/>
                        <circle cx="8" cy="8" r="1.5"/>
                        <circle cx="14" cy="8" r="1.5"/>
                      </svg>
                    </button>

                    {openDropdown === sym && (
                      <div className="absolute right-0 top-8 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 w-48 py-2">
                        <div className="px-3 py-2 text-xs font-medium text-gray-300 border-b border-gray-600">
                          Show/Hide Fields
                        </div>
                        {FIELD_DEFINITIONS.map((field) => {
                          const config = getFieldConfig(sym);
                          const isVisible = config[field.key];
                          return (
                            <label key={field.key} className="flex items-center px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={(e) => updateFieldConfig(sym, field.key, e.target.checked)}
                                className="mr-3 rounded"
                              />
                              {field.label}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-2xl font-semibold mb-2">${price ? price.toLocaleString() : '—'}</div>

              <div className="grid grid-cols-2 gap-y-2 text-sm">
                {(() => {
                  const config = getFieldConfig(sym);
                  const visibleFields = [];

                  if (config['1m_roc']) {
                    visibleFields.push(
                      <label key="1m_roc_label" className="text-sub">1m ROC</label>,
                      <div key="1m_roc_value" className={clsx(roc1 != null && (roc1 >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc1 != null ? `${roc1.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['5m_roc']) {
                    visibleFields.push(
                      <label key="5m_roc_label" className="text-sub">5m ROC</label>,
                      <div key="5m_roc_value" className={clsx(roc5 != null && (roc5 >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc5 != null ? `${roc5.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['15m_roc']) {
                    visibleFields.push(
                      <label key="15m_roc_label" className="text-sub">15m ROC</label>,
                      <div key="15m_roc_value" className={clsx(roc15 != null && (roc15 >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc15 != null ? `${roc15.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['30m_roc']) {
                    visibleFields.push(
                      <label key="30m_roc_label" className="text-sub">30m ROC</label>,
                      <div key="30m_roc_value" className={clsx(roc30 != null && (roc30 >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc30 != null ? `${roc30.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['1h_roc']) {
                    visibleFields.push(
                      <label key="1h_roc_label" className="text-sub">1h ROC</label>,
                      <div key="1h_roc_value" className={clsx(roc1h != null && (roc1h >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc1h != null ? `${roc1h.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['4h_roc']) {
                    visibleFields.push(
                      <label key="4h_roc_label" className="text-sub">4h ROC</label>,
                      <div key="4h_roc_value" className={clsx(roc4h != null && (roc4h >= 0 ? 'text-good' : 'text-bad'))}>
                        {roc4h != null ? `${roc4h.toFixed(2)}%` : '—'}
                      </div>
                    );
                  }

                  if (config['volume']) {
                    visibleFields.push(
                      <label key="volume_label" className="text-sub">Volume</label>,
                      <div key="volume_value">{vol != null ? Math.round(vol).toLocaleString() : '—'}</div>
                    );
                  }

                  if (config['vol_avg']) {
                    visibleFields.push(
                      <label key="vol_avg_label" className="text-sub">Vol Avg</label>,
                      <div key="vol_avg_value">{volAvg != null ? Math.round(volAvg).toLocaleString() : '—'}</div>
                    );
                  }

                  if (config['book_imbalance']) {
                    visibleFields.push(
                      <label key="book_imbalance_label" className="text-sub">Book Imbalance</label>,
                      <div key="book_imbalance_value">{imb != null ? imb.toFixed(2) : '—'}</div>
                    );
                  }

                  if (config['last_signal']) {
                    visibleFields.push(
                      <label key="last_signal_label" className="text-sub">Last Signal</label>,
                      <div key="last_signal_value" className="text-xs">
                        {recentSignal ? (
                          <span>
                            {new Date(recentSignal.ts).toLocaleTimeString()} — 1m {Number(recentSignal.roc1m).toFixed(2)}% | 5m {Number(recentSignal.roc5m).toFixed(2)}% | Vol×{Number(recentSignal.vol_mult).toFixed(2)} | Imb {Number(recentSignal.book_imb).toFixed(2)}
                          </span>
                        ) : (
                          'None'
                        )}
                      </div>
                    );
                  }

                  return visibleFields;
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

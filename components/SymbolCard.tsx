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

type SymbolCardProps = {
  sym: string;
  row: LatestTick | undefined;
  sig: Signal | null;
  rocData: MultiHorizonROC | undefined;
  fieldConfigs: Record<string, FieldConfig>;
  openDropdown: string | null;
  setOpenDropdown: (symbol: string | null) => void;
  updateFieldConfig: (symbol: string, field: FieldKey, visible: boolean) => void;
  getFieldConfig: (symbol: string) => Record<string, boolean>;
  formatLargeNumber: (num: number) => string;
};

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: '1m_roc', label: '1m ROC', defaultVisible: true },
  { key: '5m_roc', label: '5m ROC', defaultVisible: true },
  { key: '15m_roc', label: '15m ROC', defaultVisible: true },
  { key: '30m_roc', label: '30m ROC', defaultVisible: true },
  { key: '1h_roc', label: '1h ROC', defaultVisible: true },
  { key: '4h_roc', label: '4h ROC', defaultVisible: true },
  { key: 'volume', label: 'Volume', defaultVisible: true },
  { key: 'book_imbalance', label: 'Book Imbalance', defaultVisible: true },
  { key: 'last_signal', label: 'Last Signal', defaultVisible: true },
];

function SymbolCard({
  sym,
  row,
  sig,
  rocData,
  fieldConfigs,
  openDropdown,
  setOpenDropdown,
  updateFieldConfig,
  getFieldConfig,
  formatLargeNumber
}: SymbolCardProps) {
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

  const toggleDropdown = (symbol: string) => {
    setOpenDropdown(openDropdown === symbol ? null : symbol);
  };

  return (
    <div className={clsx(
      'card-modern p-6 group',
      recentSignal && 'ring-2 ring-success/50 shadow-glow-success'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
            <span className="text-accent font-bold text-sm">{sym.slice(0, 2)}</span>
          </div>
          <div>
            <a
              href={`https://www.binance.com/en/futures/${sym}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold text-white hover:text-accent transition-colors"
            >
              {sym}
            </a>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-xs text-slate-400">
                {ts ? ts.toLocaleTimeString() : '—'}
              </div>
              {recentSignal && (
                <div className="status-badge status-active">
                  Signal
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => toggleDropdown(sym)}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Customize view"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="2" cy="8" r="1.5"/>
              <circle cx="8" cy="8" r="1.5"/>
              <circle cx="14" cy="8" r="1.5"/>
            </svg>
          </button>

          {openDropdown === sym && (
            <div className="absolute right-0 top-10 bg-card border border-borderLight rounded-lg shadow-card-hover z-50 w-56 py-2">
              <div className="px-4 py-3 text-sm font-medium text-white border-b border-border">
                Customize View
              </div>
              {FIELD_DEFINITIONS.map((field) => {
                const config = getFieldConfig(sym);
                const isVisible = config[field.key];
                return (
                  <label key={field.key} className="flex items-center px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => updateFieldConfig(sym, field.key, e.target.checked)}
                      className="mr-3 rounded border-slate-600"
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Price Display */}
      <div className="mb-6">
        <div className="text-3xl font-bold text-white mb-1">
          ${price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </div>
        {roc1 != null && (
          <div className={clsx(
            'text-sm font-medium',
            roc1 >= 0 ? 'text-success' : 'text-danger'
          )}>
            {roc1 >= 0 ? '+' : ''}{roc1.toFixed(2)}% (1m)
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="space-y-1">
        {(() => {
          const config = getFieldConfig(sym);
          const metrics = [];

          if (config['1m_roc'] && roc1 != null) {
            metrics.push(
              <div key="1m_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">1m ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc1 >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc1 >= 0 ? '+' : ''}{roc1.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['5m_roc'] && roc5 != null) {
            metrics.push(
              <div key="5m_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">5m ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc5 >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc5 >= 0 ? '+' : ''}{roc5.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['15m_roc'] && roc15 != null) {
            metrics.push(
              <div key="15m_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">15m ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc15 >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc15 >= 0 ? '+' : ''}{roc15.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['30m_roc'] && roc30 != null) {
            metrics.push(
              <div key="30m_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">30m ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc30 >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc30 >= 0 ? '+' : ''}{roc30.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['1h_roc'] && roc1h != null) {
            metrics.push(
              <div key="1h_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">1h ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc1h >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc1h >= 0 ? '+' : ''}{roc1h.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['4h_roc'] && roc4h != null) {
            metrics.push(
              <div key="4h_roc" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">4h ROC</span>
                <span className={clsx(
                  'font-bold',
                  roc4h >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {roc4h >= 0 ? '+' : ''}{roc4h.toFixed(2)}%
                </span>
              </div>
            );
          }

          if (config['volume'] && vol != null) {
            const usdVolume = price ? vol * price : 0;
            metrics.push(
              <div key="volume" className="flex flex-col py-1 px-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-400">Volume</span>
                  <span className="font-bold text-info">
                    {formatLargeNumber(vol)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">USD</span>
                  <span className="font-semibold text-green-400 text-xs">
                    ${formatLargeNumber(usdVolume)}
                  </span>
                </div>
              </div>
            );
          }

          if (config['book_imbalance'] && imb != null) {
            metrics.push(
              <div key="book_imbalance" className="flex items-center justify-between py-1 px-3 bg-slate-800/30 rounded-lg">
                <span className="text-sm text-slate-400">Book Imbalance</span>
                <span className="font-bold text-warning">
                  {imb.toFixed(2)}
                </span>
              </div>
            );
          }

          if (config['last_signal']) {
            metrics.push(
              <div key="last_signal" className="py-1 px-3 bg-slate-800/30 rounded-lg">
                <div className="text-sm text-slate-400 mb-2">Last Signal</div>
                {recentSignal ? (
                  <div className="text-xs space-y-1">
                    <div className="text-slate-300">
                      {new Date(recentSignal.ts).toLocaleTimeString()}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className={clsx(
                        Number(recentSignal.roc1m) >= 0 ? 'text-success' : 'text-danger'
                      )}>
                        1m: {Number(recentSignal.roc1m).toFixed(2)}%
                      </span>
                      <span className={clsx(
                        Number(recentSignal.roc5m) >= 0 ? 'text-success' : 'text-danger'
                      )}>
                        5m: {Number(recentSignal.roc5m).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No recent signals</div>
                )}
              </div>
            );
          }

          return metrics.length > 0 ? metrics : (
            <div className="text-center py-4 text-slate-400 text-sm">
              No metrics configured
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default SymbolCard;

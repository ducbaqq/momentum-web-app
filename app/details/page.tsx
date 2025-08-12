'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeriesPartialOptions, HistogramSeriesPartialOptions } from 'lightweight-charts';

const TF_OPTIONS = [
  { label: '1m', value: '1m', minutes: 1 },
  { label: '5m', value: '5m', minutes: 5 },
  { label: '15m', value: '15m', minutes: 15 },
  { label: '1h', value: '1h', minutes: 60 },
  { label: '4h', value: '4h', minutes: 240 },
];

// Simple RSI(14) from closes
function calcRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    const g = Math.max(0, diff);
    const l = Math.max(0, -diff);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }
  return rsi;
}

export default function DetailsPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState('15m');
  const [loading, setLoading] = useState(false);
  const [chartHeight, setChartHeight] = useState(400); // Main chart height
  const [volumeHeight, setVolumeHeight] = useState(120); // Volume chart height
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi['addCandlestickSeries']> | null>(null);
  const volSeriesRef = useRef<ReturnType<IChartApi['addHistogramSeries']> | null>(null);
  const rsiSeriesRef = useRef<ReturnType<IChartApi['addLineSeries']> | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  const theme = useMemo(() => ({
    layout: { background: { type: ColorType.Solid, color: '#0b0e11' }, textColor: '#e6e6e6' },
    grid: { vertLines: { color: '#20252b' }, horzLines: { color: '#20252b' } },
    crosshair: { mode: 1 },
    timeScale: { borderColor: '#20252b' },
    rightPriceScale: { borderColor: '#20252b' },
  }), []);

  async function fetchSymbols() {
    try {
      const res = await fetch('/api/symbols', { cache: 'no-store' });
      const data = await res.json();
      const availableSymbols = data.symbols || [];
      setSymbols(availableSymbols);
      if (availableSymbols.length > 0 && !availableSymbols.includes(symbol)) {
        setSymbol(availableSymbols[0]);
      }
    } catch (e) {
      // Keep current symbol if fetch fails
    }
  }

  // Add mouse event handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseY = e.clientY - containerRect.top - 100; // Account for header space
    const totalHeight = chartHeight + volumeHeight;
    const minChartHeight = 200;
    const minVolumeHeight = 80;
    
    const newChartHeight = Math.max(minChartHeight, Math.min(totalHeight - minVolumeHeight, mouseY));
    const newVolumeHeight = totalHeight - newChartHeight;
    
    setChartHeight(newChartHeight);
    setVolumeHeight(newVolumeHeight);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Effect for mouse events
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, chartHeight, volumeHeight]);

  async function loadData() {
    setLoading(true);
    try {
      const limit = 500;
      const url = `/api/ohlcv?symbol=${symbol}&tf=${tf}&limit=${limit}`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      const candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = json.candles || [];

      console.log('Candles data:', candles.length, 'candles loaded');
      console.log('Sample candle:', candles[0]);

      if (containerRef.current && candles.length > 0) {
        const mainChartContainer = containerRef.current.querySelector('#main-chart') as HTMLDivElement;
        const volumeChartContainer = containerRef.current.querySelector('#volume-chart') as HTMLDivElement;
        
        if (mainChartContainer && volumeChartContainer) {
          // Clear existing charts
          if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
          }
          if (volumeChartRef.current) {
            volumeChartRef.current.remove();
            volumeChartRef.current = null;
          }
          if (resizeHandlerRef.current) {
            window.removeEventListener('resize', resizeHandlerRef.current);
            resizeHandlerRef.current = null;
          }

          // Create main chart with synchronized time scale settings
          console.log('Creating main chart...');
          const timeScaleOptions = {
            borderColor: '#20252b',
            rightOffset: 12,
            barSpacing: 6,
          };
          
          const mainChart = createChart(mainChartContainer, {
            width: mainChartContainer.clientWidth,
            height: chartHeight,
            layout: { background: { type: ColorType.Solid, color: '#0b0e11' }, textColor: '#e6e6e6' },
            grid: { vertLines: { color: '#20252b' }, horzLines: { color: '#20252b' } },
            timeScale: { ...timeScaleOptions, visible: false },
            rightPriceScale: { borderColor: '#20252b' },
            handleScroll: {
              mouseWheel: true,
              pressedMouseMove: true,
            },
            handleScale: {
              mouseWheel: true,
              pinch: true,
            },
          });
          chartRef.current = mainChart;

          const candleSeries = mainChart.addCandlestickSeries({
            upColor: '#22c55e', 
            downColor: '#ef4444', 
            borderVisible: false,
            wickUpColor: '#22c55e', 
            wickDownColor: '#ef4444',
          });
          candleSeriesRef.current = candleSeries;

          // Create volume chart with identical time scale settings
          console.log('Creating volume chart...');
          const volumeChart = createChart(volumeChartContainer, {
            width: volumeChartContainer.clientWidth,
            height: volumeHeight,
            layout: { background: { type: ColorType.Solid, color: '#0b0e11' }, textColor: '#e6e6e6' },
            grid: { vertLines: { color: '#20252b' }, horzLines: { color: '#20252b' } },
            timeScale: { ...timeScaleOptions, visible: true },
            rightPriceScale: { borderColor: '#20252b' },
            handleScroll: {
              mouseWheel: true,
              pressedMouseMove: true,
            },
            handleScale: {
              mouseWheel: true,
              pinch: true,
            },
          });
          volumeChartRef.current = volumeChart;

          const volSeries = volumeChart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
          });
          volSeriesRef.current = volSeries;

          // Add data
          console.log('Adding candlestick data...');
          const candleData = candles.map(c => ({ 
            time: c.time, 
            open: c.open, 
            high: c.high, 
            low: c.low, 
            close: c.close 
          }));
          candleSeries.setData(candleData);
          
          console.log('Adding volume data...');
          const volumeData = candles.map((c, i) => ({ 
            time: c.time, 
            value: c.volume, 
            color: i === 0 ? '#22c55e' : (c.close >= candles[i-1].close ? '#22c55e' : '#ef4444')
          }));
          volSeries.setData(volumeData);

          // Synchronize time scales with debounced approach to prevent locks
          let syncTimeout: NodeJS.Timeout | null = null;
          
          const syncCharts = (sourceChart: IChartApi, targetChart: IChartApi) => {
            if (syncTimeout) clearTimeout(syncTimeout);
            
            syncTimeout = setTimeout(() => {
              try {
                const sourceRange = sourceChart.timeScale().getVisibleRange();
                const sourceOptions = sourceChart.timeScale().options();
                
                if (sourceRange) {
                  targetChart.timeScale().setVisibleRange(sourceRange);
                  targetChart.timeScale().applyOptions({
                    barSpacing: sourceOptions.barSpacing,
                    rightOffset: sourceOptions.rightOffset,
                  });
                }
              } catch (e) {
                console.warn('Sync error:', e);
              }
            }, 16); // ~60fps debounce
          };
          
          mainChart.timeScale().subscribeVisibleTimeRangeChange(() => {
            if (volumeChartRef.current) {
              syncCharts(mainChart, volumeChartRef.current);
            }
          });

          volumeChart.timeScale().subscribeVisibleTimeRangeChange(() => {
            if (chartRef.current) {
              syncCharts(volumeChart, chartRef.current);
            }
          });

          // Fit content and sync
          mainChart.timeScale().fitContent();
          
          // Sync volume chart to main chart's visible range
          setTimeout(() => {
            if (chartRef.current && volumeChartRef.current) {
              try {
                const visibleRange = chartRef.current.timeScale().getVisibleRange();
                if (visibleRange) {
                  volumeChartRef.current.timeScale().setVisibleRange(visibleRange);
                }
              } catch (e) {
                console.warn('Initial sync error:', e);
              }
            }
          }, 100);

          console.log('Charts created and synchronized successfully');

          // Handle resize
          const onResize = () => {
            if (chartRef.current && volumeChartRef.current) {
              chartRef.current.applyOptions({ width: mainChartContainer.clientWidth });
              volumeChartRef.current.applyOptions({ width: volumeChartContainer.clientWidth });
            }
          };
          resizeHandlerRef.current = onResize;
          window.addEventListener('resize', onResize);
        }
      }
    } catch (e: any) {
      console.error('Chart loading error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSymbols(); }, []);
  useEffect(() => { loadData(); }, [symbol, tf]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
      }
      if (volumeChartRef.current) {
        volumeChartRef.current.remove();
      }
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
      }
    };
  }, []);

  // Effect to update chart sizes when dimensions change
  useEffect(() => {
    if (chartRef.current && volumeChartRef.current) {
      chartRef.current.applyOptions({ height: chartHeight });
      volumeChartRef.current.applyOptions({ height: volumeHeight });
      
      // Re-synchronize both visible range and bar spacing after resize
      setTimeout(() => {
        try {
          const visibleRange = chartRef.current?.timeScale().getVisibleRange();
          const mainOptions = chartRef.current?.timeScale().options();
          
          if (visibleRange && volumeChartRef.current && mainOptions) {
            const volumeTimeScale = volumeChartRef.current.timeScale();
            volumeTimeScale.setVisibleRange(visibleRange);
            volumeTimeScale.applyOptions({
              barSpacing: mainOptions.barSpacing,
              rightOffset: mainOptions.rightOffset,
            });
          }
        } catch (e) {
          console.warn('Resize sync error:', e);
        }
      }, 50);
    }
  }, [chartHeight, volumeHeight]);

  return (
    <main className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="text-lg font-semibold mb-3">Details</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-bg border border-border rounded px-2 py-1">
          {symbols.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={tf} onChange={(e) => setTf(e.target.value)} className="bg-bg border border-border rounded px-2 py-1">
          {TF_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {loading && <span className="text-sub">Loading…</span>}
      </div>
      
      <div ref={containerRef} className="w-full select-none" style={{ height: chartHeight + volumeHeight + 20 }}>
        {/* Main candlestick chart */}
        <div 
          id="main-chart" 
          className="w-full border border-border rounded-t" 
          style={{ height: chartHeight }}
        />
        
        {/* Draggable separator */}
        <div 
          className={`w-full h-2 bg-border hover:bg-gray-600 cursor-ns-resize flex items-center justify-center transition-colors ${isDragging ? 'bg-gray-500' : ''}`}
          onMouseDown={handleMouseDown}
        >
          <div className="w-8 h-0.5 bg-gray-400 rounded"></div>
        </div>
        
        {/* Volume chart */}
        <div 
          id="volume-chart" 
          className="w-full border border-border rounded-b border-t-0" 
          style={{ height: volumeHeight }}
        />
      </div>
      
      <p className="text-sub mt-2">
        Drag the separator to resize chart areas. Candles aggregated from 1m ticks; highs/lows reflect closes within each bucket.
      </p>
    </main>
  );
}
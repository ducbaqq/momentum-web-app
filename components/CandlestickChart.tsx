'use client';

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { formatCompactLocalDateTime } from '@/lib/dateUtils';

// Dynamic import for lightweight-charts to avoid SSR issues
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';

type ChartData = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TimeframeOption = '1m' | '15m' | '1h' | '4h';

interface CandlestickChartProps {
  symbols: string[];
  startDate: string;
  endDate: string;
  className?: string;
}

export default function CandlestickChart({ symbols, startDate, endDate, className }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0] || '');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeOption>('15m');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeframeOptions: TimeframeOption[] = ['1m', '15m', '1h', '4h'];

  // Initialize chart
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initChart = async () => {
      console.log('[Chart] Initializing chart...');
      
      if (!chartContainerRef.current) {
        console.log('[Chart] Container not ready');
        return;
      }

      try {
        // Clear any existing chart first
        if (chartRef.current) {
          console.log('[Chart] Removing existing chart');
          chartRef.current.remove();
          chartRef.current = null;
          candlestickSeriesRef.current = null;
        }

        // Dynamic import to avoid SSR issues
        console.log('[Chart] Loading lightweight-charts library');
        const { createChart, ColorType } = await import('lightweight-charts');
        console.log('[Chart] Library loaded successfully');
        
        const containerWidth = chartContainerRef.current.clientWidth || 600;
        console.log(`[Chart] Creating chart with width: ${containerWidth}`);

        const chart = createChart(chartContainerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#d1d5db',
            fontSize: 12,
          },
          grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
          },
          crosshair: {
            mode: 1,
            vertLine: {
              color: '#6b7280',
              width: 1,
              style: 2,
            },
            horzLine: {
              color: '#6b7280',
              width: 1,
              style: 2,
            },
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#374151',
          },
          rightPriceScale: {
            borderColor: '#374151',
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          },
          width: containerWidth,
          height: 400,
        });

        console.log('[Chart] Chart created, adding candlestick series');

        const candlestickSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderDownColor: '#ef4444',
          borderUpColor: '#10b981',
          wickDownColor: '#ef4444',
          wickUpColor: '#10b981',
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;

        console.log('[Chart] Chart initialized successfully');

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current && chart) {
            const newWidth = chartContainerRef.current.clientWidth;
            console.log(`[Chart] Resizing chart to width: ${newWidth}`);
            chart.applyOptions({ width: newWidth });
          }
        };

        window.addEventListener('resize', handleResize);

        cleanup = () => {
          console.log('[Chart] Cleaning up chart');
          window.removeEventListener('resize', handleResize);
          if (chart) {
            chart.remove();
          }
        };

      } catch (error) {
        console.error('[Chart] Failed to initialize chart:', error);
        setError('Failed to initialize chart: ' + (error as Error).message);
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initChart, 100);

    return () => {
      clearTimeout(timer);
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  // Fetch chart data
  const fetchChartData = async (symbol: string, timeframe: TimeframeOption) => {
    if (!symbol || !startDate || !endDate) return;
    
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        symbol,
        tf: timeframe,
        start_date: startDate,
        end_date: endDate,
        limit: '2000'
      });

      const url = `/api/backtest/chart?${params}`;
      console.log('Fetching chart data from:', url);

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Chart API response:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setChartData(data.candles || []);
      console.log('Set chart data:', data.candles?.length || 0, 'candles');
    } catch (e: any) {
      console.error('Failed to fetch chart data:', e);
      setError(e.message);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  // Update chart data when it changes
  useEffect(() => {
    if (candlestickSeriesRef.current && chartData.length > 0) {
      console.log(`[Chart] Setting ${chartData.length} data points on chart`);
      
      try {
        const formattedData: CandlestickData[] = chartData.map(d => ({
          time: d.time as UTCTimestamp,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));

        console.log('[Chart] Data formatted, sample:', formattedData[0]);
        candlestickSeriesRef.current.setData(formattedData);
        console.log('[Chart] Data set on series');
        
        // Fit content after a short delay to ensure chart is rendered
        setTimeout(() => {
          if (chartRef.current) {
            console.log('[Chart] Fitting content to chart');
            chartRef.current.timeScale().fitContent();
          }
        }, 200);
      } catch (error) {
        console.error('[Chart] Error setting chart data:', error);
        setError('Error setting chart data: ' + (error as Error).message);
      }
    } else if (chartData.length === 0 && candlestickSeriesRef.current) {
      console.log('[Chart] No data available, clearing chart');
    }
  }, [chartData]);

  // Fetch data when symbol or timeframe changes
  useEffect(() => {
    if (selectedSymbol && startDate && endDate) {
      console.log('Fetching chart data for:', selectedSymbol, selectedTimeframe, startDate, endDate);
      fetchChartData(selectedSymbol, selectedTimeframe);
    }
  }, [selectedSymbol, selectedTimeframe, startDate, endDate]);

  // Set default symbol when symbols change
  useEffect(() => {
    if (symbols.length > 0 && !selectedSymbol) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  // Debug logging
  console.log('Chart component render:', {
    symbols: symbols.length,
    selectedSymbol,
    startDate,
    endDate,
    loading,
    error,
    chartDataLength: chartData.length
  });

  if (symbols.length === 0) {
    return (
      <div className={clsx("rounded-xl border border-border bg-card p-6", className)}>
        <h2 className="text-2xl font-bold mb-6">📈 Price Chart</h2>
        <div className="text-center text-sub py-12">
          <p>No symbols available for chart display.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-xl border border-border bg-card p-6", className)}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold">📈 Price Chart</h2>
        
        <div className="flex flex-wrap gap-4">
          {/* Symbol Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Symbol:</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-bg border border-border rounded px-3 py-1 text-sm"
            >
              {symbols.map(symbol => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Timeframe:</label>
            <div className="flex rounded border border-border overflow-hidden">
              {timeframeOptions.map(tf => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={clsx(
                    "px-3 py-1 text-sm font-medium transition-colors",
                    selectedTimeframe === tf
                      ? "bg-blue-600 text-white"
                      : "bg-bg hover:bg-bg/70"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center text-sub py-12">
          <p>Loading chart data...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-red-400">Error loading chart: {error}</p>
          <button
            onClick={() => fetchChartData(selectedSymbol, selectedTimeframe)}
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div 
            ref={chartContainerRef} 
            className="w-full h-96 mb-4"
            style={{ minHeight: '400px' }}
          />
          
          {chartData.length > 0 && (
            <div className="text-xs text-sub text-center">
              Showing {chartData.length} candles for {selectedSymbol} ({selectedTimeframe})
              <br />
              {formatCompactLocalDateTime(startDate)} - {formatCompactLocalDateTime(endDate)}
            </div>
          )}

          {!loading && !error && chartData.length === 0 && (
            <div className="text-center text-sub py-8">
              <p>No chart data available for the selected period.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
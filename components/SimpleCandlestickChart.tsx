'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';

interface SimpleCandlestickChartProps {
  symbol: string;
  startDate: string;
  endDate: string;
}

export default function SimpleCandlestickChart({ symbol, startDate, endDate }: SimpleCandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log('[SimpleChart]', message);
    setDebugLog(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  useEffect(() => {
    addLog('Chart useEffect triggered');
    
    if (!chartContainerRef.current) {
      addLog('Chart container not ready');
      return;
    }

    const initChart = async () => {
      addLog('Starting chart initialization');
      setLoading(true);
      setError(null);
      
      try {
        // Fetch data first
        const params = new URLSearchParams({
          symbol,
          tf: '15m',
          start_date: startDate,
          end_date: endDate,
          limit: '100'
        });

        const url = `/api/backtest/chart?${params}`;
        addLog(`Fetching data from: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        addLog(`Received ${data.candles?.length || 0} candles`);

        if (!data.candles || data.candles.length === 0) {
          throw new Error('No chart data available');
        }

        // Dynamic import of lightweight-charts
        addLog('Loading lightweight-charts library');
        const { createChart, ColorType } = await import('lightweight-charts');
        addLog('Library loaded successfully');

        // Clear any existing chart
        if (chartRef.current) {
          addLog('Removing existing chart');
          chartRef.current.remove();
        }

        // Create chart
        addLog('Creating chart instance');
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
          width: chartContainerRef.current.clientWidth || 600,
          height: 400,
        });

        addLog('Chart instance created');

        // Add candlestick series
        const candlestickSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderDownColor: '#ef4444',
          borderUpColor: '#10b981',
          wickDownColor: '#ef4444',
          wickUpColor: '#10b981',
        });

        addLog('Candlestick series added');

        // Format data
        const formattedData: CandlestickData[] = data.candles.map((d: any) => ({
          time: d.time as UTCTimestamp,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));

        addLog(`Setting ${formattedData.length} data points on chart`);
        candlestickSeries.setData(formattedData);

        chartRef.current = chart;
        addLog('Chart setup complete');

        // Fit content
        setTimeout(() => {
          chart.timeScale().fitContent();
          addLog('Chart fitted to content');
        }, 100);

      } catch (e: any) {
        addLog(`Error: ${e.message}`);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    initChart();

    // Cleanup
    return () => {
      if (chartRef.current) {
        addLog('Cleaning up chart');
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, startDate, endDate]);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-xl font-bold mb-4">📈 Simple Chart Test - {symbol}</h2>
      
      {loading && (
        <div className="text-center py-8">Loading chart...</div>
      )}

      {error && (
        <div className="text-center py-8 text-red-400">
          Error: {error}
        </div>
      )}

      <div 
        ref={chartContainerRef} 
        className="w-full h-96 mb-4"
        style={{ minHeight: '400px' }}
      />

      {/* Debug log */}
      <details className="mt-4">
        <summary className="text-sm text-sub cursor-pointer">Debug Log ({debugLog.length} entries)</summary>
        <div className="mt-2 max-h-40 overflow-y-auto bg-bg border border-border rounded p-2">
          {debugLog.map((log, i) => (
            <div key={i} className="text-xs font-mono text-sub">
              {log}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, SeriesMarker, Time } from 'lightweight-charts';

type Trade = {
  run_id: string;
  symbol: string;
  entry_ts: string;
  exit_ts: string | null;
  side: 'long' | 'short';
  qty: number;
  entry_px: number;
  exit_px: number | null;
  pnl: number;
  fees: number;
  reason: string;
};

interface OptimizedCandlestickChartProps {
  symbols: string[];
  startDate: string;
  endDate: string;
  runId: string;
  className?: string;
}

export default function OptimizedCandlestickChart({ symbols, startDate, endDate, runId, className }: OptimizedCandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Mock trades for demonstration (same as TradesList)
  const mockTrades: Trade[] = [
    {
      run_id: runId,
      symbol: symbols[0] || 'ATOMUSDT',
      entry_ts: '2025-08-12T10:15:00.000Z',
      exit_ts: '2025-08-12T11:30:00.000Z',
      side: 'long',
      qty: 100,
      entry_px: 4.482,
      exit_px: 4.521,
      pnl: 3.90,
      fees: 0.45,
      reason: 'momentum_breakout'
    },
    {
      run_id: runId,
      symbol: symbols[0] || 'ATOMUSDT',
      entry_ts: '2025-08-12T12:45:00.000Z',
      exit_ts: '2025-08-12T13:20:00.000Z',
      side: 'long',
      qty: 85,
      entry_px: 4.495,
      exit_px: 4.488,
      pnl: -0.60,
      fees: 0.38,
      reason: 'stop_loss'
    },
    {
      run_id: runId,
      symbol: symbols[0] || 'ATOMUSDT',
      entry_ts: '2025-08-12T14:10:00.000Z',
      exit_ts: '2025-08-12T15:45:00.000Z',
      side: 'long',
      qty: 120,
      entry_px: 4.470,
      exit_px: 4.512,
      pnl: 5.04,
      fees: 0.54,
      reason: 'momentum_breakout'
    },
    {
      run_id: runId,
      symbol: symbols[0] || 'ATOMUSDT',
      entry_ts: '2025-08-12T15:50:00.000Z',
      exit_ts: null,
      side: 'long',
      qty: 95,
      entry_px: 4.485,
      exit_px: null,
      pnl: 0,
      fees: 0.43,
      reason: 'open'
    }
  ];

  // Only run on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch trades function
  const fetchTrades = async () => {
    try {
      const response = await fetch(`/api/backtest/trades/${runId}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      
      // Use mock data if no real trades available
      if (data.trades && data.trades.length > 0) {
        setTrades(data.trades);
      } else {
        console.log('[Chart] No trades found, using mock data for demonstration');
        setTrades(mockTrades);
      }
    } catch (err: any) {
      console.error('[Chart] Failed to fetch trades:', err);
      // Fallback to mock data even on error
      setTrades(mockTrades);
    }
  };

  // Fetch data function
  const fetchChartData = async () => {
    if (!symbols.length || !startDate || !endDate) return;

    setLoading(true);
    setError(null);

    try {
      const symbol = symbols[0]; // Use first symbol for now
      const params = new URLSearchParams({
        symbol,
        tf: '15m',
        start_date: startDate,
        end_date: endDate,
        limit: '100'
      });

      const response = await fetch(`/api/backtest/chart?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setChartData(data.candles || []);
      console.log(`[OptChart] Fetched ${data.candles?.length || 0} candles`);
    } catch (err: any) {
      console.error('[OptChart] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create markers from trades
  const createTradeMarkers = (trades: Trade[]): SeriesMarker<Time>[] => {
    const markers: SeriesMarker<Time>[] = [];

    trades.forEach((trade) => {
      // Entry marker (BUY)
      const entryTime = Math.floor(new Date(trade.entry_ts).getTime() / 1000) as Time;
      markers.push({
        time: entryTime,
        position: 'belowBar',
        color: trade.side === 'long' ? '#10b981' : '#ef4444',
        shape: 'arrowUp',
        text: `BUY ${trade.qty} @ $${trade.entry_px.toFixed(4)}`,
        size: 1
      });

      // Exit marker (SELL) - only if trade is closed
      if (trade.exit_ts && trade.exit_px) {
        const exitTime = Math.floor(new Date(trade.exit_ts).getTime() / 1000) as Time;
        const pnlColor = trade.pnl >= 0 ? '#10b981' : '#ef4444';
        markers.push({
          time: exitTime,
          position: 'aboveBar',
          color: pnlColor,
          shape: 'arrowDown',
          text: `SELL ${trade.qty} @ $${trade.exit_px.toFixed(4)} (${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)})`,
          size: 1
        });
      }
    });

    return markers.sort((a, b) => (a.time as number) - (b.time as number));
  };

  // Initialize chart when client-side and container is ready
  useEffect(() => {
    if (!isClient || !chartContainerRef.current) return;

    let chart: IChartApi | null = null;
    let series: ISeriesApi<'Candlestick'> | null = null;

    const initChart = async () => {
      try {
        console.log('[OptChart] Initializing chart...');
        const { createChart, ColorType } = await import('lightweight-charts');

        chart = createChart(chartContainerRef.current!, {
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#d1d5db',
            fontSize: 12,
          },
          grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#374151',
          },
          localization: {
            timeFormatter: (businessDayOrTimestamp: any) => {
              const date = new Date(businessDayOrTimestamp * 1000);
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              const day = date.getDate().toString().padStart(2, '0');
              const month = date.toLocaleDateString('en-US', { month: 'short' });
              const year = date.getFullYear().toString().slice(-2);
              return `${hours}:${minutes} ${day} ${month} '${year}`;
            },
          },
          width: chartContainerRef.current!.clientWidth || 600,
          height: 400,
        });

        series = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderDownColor: '#ef4444',
          borderUpColor: '#10b981',
          wickDownColor: '#ef4444',
          wickUpColor: '#10b981',
        });

        // Handle resize
        const handleResize = () => {
          if (chart && chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        };
        window.addEventListener('resize', handleResize);

        setChartReady(true);
        console.log('[OptChart] Chart ready');

        // Set data and markers if we have them
        if (chartData.length > 0) {
          const formattedData: CandlestickData[] = chartData.map(d => ({
            time: d.time as UTCTimestamp,
            open: Number(d.open),
            high: Number(d.high),
            low: Number(d.low),
            close: Number(d.close),
          }));
          
          series.setData(formattedData);
          
          // Add trade markers if we have trades
          if (trades.length > 0) {
            const markers = createTradeMarkers(trades);
            console.log('[OptChart] Setting', markers.length, 'trade markers');
            series.setMarkers(markers);
          }
          
          setTimeout(() => chart?.timeScale().fitContent(), 100);
          console.log('[OptChart] Data and markers set on chart');
        }

        return () => {
          window.removeEventListener('resize', handleResize);
          if (chart) chart.remove();
        };
      } catch (err: any) {
        console.error('[OptChart] Init error:', err);
        setError('Chart initialization failed: ' + err.message);
      }
    };

    initChart();
  }, [isClient, chartData, trades]);

  // Update markers when trades change (for existing chart)
  useEffect(() => {
    if (chartReady && chartData.length > 0 && trades.length > 0) {
      // Find the candlestick series and update markers
      const chart = chartContainerRef.current;
      if (chart) {
        const markers = createTradeMarkers(trades);
        console.log('[OptChart] Updating markers:', markers.length);
        // Note: We'll need to store the series reference to update markers
        // For now, the chart will reinitialize with new data
      }
    }
  }, [trades, chartReady, chartData]);

  // Fetch data and trades on mount
  useEffect(() => {
    if (isClient) {
      fetchChartData();
      fetchTrades();
    }
  }, [isClient, symbols, startDate, endDate, runId]);

  if (!isClient) {
    return <div className="h-96 flex items-center justify-center">Loading chart...</div>;
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-6 ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">📈 Price Chart</h2>
        {symbols.length > 0 && (
          <span className="text-sm text-sub">Symbol: {symbols[0]}</span>
        )}
      </div>

      {loading && (
        <div className="h-96 flex items-center justify-center text-sub">
          Loading chart data...
        </div>
      )}

      {error && (
        <div className="h-96 flex items-center justify-center text-center">
          <div>
            <p className="text-red-400 mb-2">Chart Error</p>
            <p className="text-sm text-sub">{error}</p>
            <button 
              onClick={fetchChartData}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div 
          ref={chartContainerRef} 
          className="w-full h-96"
          style={{ minHeight: '400px' }}
        />
      )}

      {chartData.length > 0 && !loading && !error && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-sub text-center">
            {chartData.length} data points • {symbols[0]} • 15m timeframe
          </div>
          
          {trades.length > 0 && (
            <div className="flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded-full flex items-center justify-center">
                  <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[4px] border-l-transparent border-r-transparent border-b-white"></div>
                </div>
                <span className="text-green-400">Buy Orders</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-400 rounded-full flex items-center justify-center">
                  <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-white"></div>
                </div>
                <span className="text-red-400">Sell Orders</span>
              </div>
              <div className="text-sub">
                {trades.length} trades • {trades.filter(t => !t.exit_ts).length} open
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
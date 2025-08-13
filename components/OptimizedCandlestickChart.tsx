'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, SeriesMarker, Time, HistogramData } from 'lightweight-charts';

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
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);


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
      
      // Set real trades data (empty array if no trades)
      const allTrades = data.trades || [];
      // Filter trades by the symbol(s) being displayed
      const filteredTrades = symbols.length === 1 
        ? allTrades.filter((trade: Trade) => trade.symbol === symbols[0])
        : allTrades;
      setTrades(filteredTrades);
    } catch (err: any) {
      console.error('[Chart] Failed to fetch trades:', err);
      setTrades([]);
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
        limit: '500'  // Increased to handle longer backtest periods
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
    // The chart uses 15m aggregated candles; align marker times to 15m bucket starts
    const bucketSeconds = 15 * 60;
    const toBucketTime = (unixSeconds: number) => Math.floor(unixSeconds / bucketSeconds) * bucketSeconds;

    trades.forEach((trade) => {
      // Entry marker (BUY)
      const entryUnix = Math.floor(new Date(trade.entry_ts).getTime() / 1000);
      const entryTime = toBucketTime(entryUnix) as Time;
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
        const exitUnix = Math.floor(new Date(trade.exit_ts).getTime() / 1000);
        const exitTime = toBucketTime(exitUnix) as Time;
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
    let volumeSeries: ISeriesApi<'Histogram'> | null = null;

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
          height: 500, // Increased height to accommodate volume
        });

        series = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderDownColor: '#ef4444',
          borderUpColor: '#10b981',
          wickDownColor: '#ef4444',
          wickUpColor: '#10b981',
        });

        // Add volume series below the price chart
        volumeSeries = chart.addHistogramSeries({
          color: '#26a69a',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'volume',
          scaleMargins: {
            top: 0.7, // Volume takes up bottom 30% of chart
            bottom: 0,
          },
        });

        // Configure volume price scale on the right
        chart.priceScale('volume').applyOptions({
          scaleMargins: {
            top: 0.7,
            bottom: 0,
          },
        });

        // Store volume series reference for external access
        if (volumeSeriesRef && volumeSeriesRef.current !== volumeSeries) {
          volumeSeriesRef.current = volumeSeries;
        }

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
          
          // Format volume data
          const volumeData: HistogramData[] = chartData.map(d => ({
            time: d.time as UTCTimestamp,
            value: Number(d.volume),
            color: Number(d.close) >= Number(d.open) ? '#10b981' : '#ef4444', // Green for up, red for down
          }));
          
          series.setData(formattedData);
          volumeSeries.setData(volumeData);
          
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
          if (chart) {
            chart.remove();
          }
          // Clear volume series ref
          if (volumeSeriesRef) volumeSeriesRef.current = null;
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
          className="w-full h-[500px]"
          style={{ minHeight: '500px' }}
        />
      )}

      {chartData.length > 0 && !loading && !error && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-sub text-center">
            {chartData.length} data points • {symbols[0]} • 15m timeframe • Volume included
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
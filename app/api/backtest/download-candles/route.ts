import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function tfToMinutes(tf: string): number | null {
  const map: Record<string, number> = { '1m': 1, '15m': 15, '1h': 60, '4h': 240 };
  return map[tf] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbols, startDate, endDate, timeframe = '15m' } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    const mins = tfToMinutes(timeframe);
    if (!mins) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    }

    const candleData: Record<string, any[]> = {};

    // Fetch candle data for each symbol
    for (const symbol of symbols) {
      const query = `
        WITH base AS (
          SELECT ts, open::double precision AS open, high::double precision AS high, 
                 low::double precision AS low, close::double precision AS close, 
                 COALESCE(volume,0)::double precision AS volume
          FROM ohlcv_1m
          WHERE symbol = $1 
            AND ts >= $2::timestamp 
            AND ts <= $3::timestamp
        ),
        buckets AS (
          SELECT
            to_timestamp(floor(extract(epoch from ts) / ($4::int*60)) * ($4::int*60)) AT TIME ZONE 'UTC' AS bucket,
            ts, open, high, low, close, volume
          FROM base
        ),
        agg AS (
          SELECT
            bucket AS ts,
            (ARRAY_AGG(open ORDER BY ts))[1] AS open,
            MAX(high) AS high,
            MIN(low) AS low,
            (ARRAY_AGG(close ORDER BY ts))[array_length(ARRAY_AGG(close),1)] AS close,
            SUM(volume) AS volume
          FROM buckets
          GROUP BY bucket
          HAVING COUNT(*) > 0
        )
        SELECT 
          ts,
          EXTRACT(EPOCH FROM ts)::bigint AS timestamp,
          open, high, low, close, volume
        FROM agg
        ORDER BY ts ASC
        LIMIT 5000
      `;

      const result = await pool.query(query, [symbol, startDate, endDate, mins]);
      
      candleData[symbol] = result.rows.map(row => ({
        ts: row.ts,
        timestamp: Number(row.timestamp),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume)
      }));
    }

    // Generate filename
    const startStr = new Date(startDate).toISOString().slice(0, 10);
    const endStr = new Date(endDate).toISOString().slice(0, 10);
    const symbolsStr = symbols.length > 3 ? `${symbols.slice(0, 3).join('-')}_and_${symbols.length - 3}_more` : symbols.join('-');
    const filename = `candles_${symbolsStr}_${timeframe}_${startStr}_to_${endStr}.json`;

    const exportData = {
      metadata: {
        export_timestamp: new Date().toISOString(),
        export_type: 'candle_data',
        timeframe: timeframe,
        start_date: startDate,
        end_date: endDate,
        symbols: symbols,
        total_symbols: symbols.length,
        total_candles: Object.values(candleData).reduce((sum, candles) => sum + candles.length, 0)
      },
      candle_data: candleData,
      summary: {
        candles_per_symbol: Object.fromEntries(
          Object.entries(candleData).map(([symbol, candles]) => [symbol, candles.length])
        ),
        date_range: {
          start: startDate,
          end: endDate,
          duration_hours: Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60) * 10) / 10
        }
      }
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error('Download candles error:', error);
    return NextResponse.json(
      { error: 'Failed to download candle data', details: error.message },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function tfToMinutes(tf: string): number | null {
  const map: Record<string, number> = { '1m': 1, '15m': 15, '1h': 60, '4h': 240 };
  return map[tf] ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase();
  const tf = (searchParams.get('tf') || '15m').toLowerCase();
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '2000', 10), 50), 5000);

  const mins = tfToMinutes(tf || '15m');
  if (!symbol || !mins || !startDate || !endDate) {
    return NextResponse.json({ 
      error: 'symbol, valid tf, start_date, and end_date required' 
    }, { status: 400 });
  }

  try {
    const q = await pool.query(
      `WITH base AS (
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
       SELECT EXTRACT(EPOCH FROM ts)::bigint AS time, open, high, low, close, volume
       FROM agg
       ORDER BY ts ASC
       LIMIT $5`,
      [symbol, startDate, endDate, mins, limit]
    );

    return NextResponse.json({
      candles: q.rows.map(r => ({
        time: Number(r.time),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      })),
      symbol,
      timeframe: tf,
      start_date: startDate,
      end_date: endDate,
      count: q.rows.length
    });
  } catch (e: any) {
    console.error('Chart data fetch error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
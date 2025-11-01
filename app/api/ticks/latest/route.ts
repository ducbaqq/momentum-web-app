import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Optimized query: Use a subquery to get latest ts per symbol first, then join
    // This avoids expensive DISTINCT ON sorting operation
    const q = await pool.query(`
      WITH latest_ts AS (
        SELECT symbol, MAX(ts) as ts
        FROM ohlcv_1m
        WHERE ts > NOW() - INTERVAL '1 day'
        GROUP BY symbol
      )
      SELECT 
        o.symbol,
        o.ts,
        o.close,
        f.roc_1m as roc1m,
        f.roc_5m as roc5m,
        o.volume as vol,
        f.vol_avg_20 as vol_avg,
        f.book_imb,
        CASE WHEN f.roc_1m > 0.5 AND f.vol_mult > 2 THEN true ELSE false END as signal
      FROM latest_ts lt
      INNER JOIN ohlcv_1m o ON o.symbol = lt.symbol AND o.ts = lt.ts
      LEFT JOIN features_1m f ON f.symbol = o.symbol AND f.ts = o.ts
      ORDER BY o.symbol
    `);
    return NextResponse.json(q.rows);
  } catch (e: any) {
    console.error('Error fetching latest ticks:', e.message, e.stack);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
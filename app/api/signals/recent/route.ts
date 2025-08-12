import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const q = await pool.query(`
      SELECT DISTINCT ON (o.symbol)
        o.ts,
        o.symbol,
        o.close,
        f.roc_1m as roc1m,
        f.roc_5m as roc5m,
        o.volume as vol,
        f.vol_avg_20 as vol_avg,
        f.vol_mult,
        f.book_imb,
        NULL as thresholds
      FROM ohlcv_1m o
      INNER JOIN features_1m f ON o.symbol = f.symbol AND o.ts = f.ts
      WHERE o.ts > NOW() - INTERVAL '1 hour'
        AND f.roc_1m > 0.5
        AND f.vol_mult > 2
      ORDER BY o.symbol, o.ts DESC
    `);
    return NextResponse.json(q.rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
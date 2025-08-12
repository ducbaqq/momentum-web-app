import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { symbol: string } }) {
  const symbol = (params.symbol || '').toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    // Compute multi-horizon ROC values from recent minute bars.
    // We pull ~5 hours to ensure we have enough rows for 4h lag.
    const q = await pool.query(
      `WITH recent AS (
         SELECT ts, close
         FROM ohlcv_1m
         WHERE symbol = $1 AND ts > NOW() - INTERVAL '300 minutes'
         ORDER BY ts ASC
       ),
       with_lag AS (
         SELECT
           ts,
           close,
           LAG(close, 15)  OVER (ORDER BY ts) AS c15,
           LAG(close, 30)  OVER (ORDER BY ts) AS c30,
           LAG(close, 60)  OVER (ORDER BY ts) AS c60,
           LAG(close, 240) OVER (ORDER BY ts) AS c240
         FROM recent
       ),
       last_row AS (
         SELECT * FROM with_lag ORDER BY ts DESC LIMIT 1
       )
       SELECT
         CASE WHEN c15  IS NULL OR c15  = 0 THEN NULL ELSE ((close - c15)  / c15)  * 100 END AS roc15m,
         CASE WHEN c30  IS NULL OR c30  = 0 THEN NULL ELSE ((close - c30)  / c30)  * 100 END AS roc30m,
         CASE WHEN c60  IS NULL OR c60  = 0 THEN NULL ELSE ((close - c60)  / c60)  * 100 END AS roc1h,
         CASE WHEN c240 IS NULL OR c240 = 0 THEN NULL ELSE ((close - c240) / c240) * 100 END AS roc4h
       FROM last_row`,
      [symbol]
    );

    const row = q.rows[0] || {};
    return NextResponse.json({
      symbol,
      roc15m: row.roc15m !== null && row.roc15m !== undefined ? Number(row.roc15m) : null,
      roc30m: row.roc30m !== null && row.roc30m !== undefined ? Number(row.roc30m) : null,
      roc1h:  row.roc1h  !== null && row.roc1h  !== undefined ? Number(row.roc1h)  : null,
      roc4h:  row.roc4h  !== null && row.roc4h  !== undefined ? Number(row.roc4h)  : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const q = await pool.query(`
      SELECT DISTINCT symbol 
      FROM ohlcv_1m 
      WHERE ts > NOW() - INTERVAL '1 day'
      ORDER BY symbol ASC
    `);
    
    const symbols = q.rows.map(row => row.symbol);
    return NextResponse.json({ symbols });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
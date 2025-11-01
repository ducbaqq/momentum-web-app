import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get distinct symbols from latest data (no time filter - get all available symbols)
    // This matches the behavior of /api/ticks/latest
    const q = await pool.query(`
      SELECT DISTINCT symbol 
      FROM ohlcv_1m 
      ORDER BY symbol ASC
    `);
    
    const symbols = q.rows.map(row => row.symbol);
    return NextResponse.json({ symbols });
  } catch (e: any) {
    console.error('Error fetching symbols:', e.message, e.stack);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const q = await pool.query(`
      SELECT DISTINCT symbol 
      FROM ohlcv_1m 
      WHERE ts > NOW() - INTERVAL '1 day'
      ORDER BY symbol ASC
    `);
    
    const symbols = q.rows.map(row => row.symbol);
    return NextResponse.json({ symbols });
  } catch (e: any) {
    console.error('Error fetching symbols:', e.message, e.stack);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
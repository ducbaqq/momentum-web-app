import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT run_id, name, start_ts, end_ts, symbols, timeframe, strategy_name, strategy_version, params, seed, status, created_at, error
      FROM trader_runs
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const runs = result.rows.map(row => ({
      ...row,
      symbols: Array.isArray(row.symbols) ? row.symbols : [],
      params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
      error: row.error || null,
    }));

    return NextResponse.json({ runs });
  } catch (e: any) {
    console.error('Fetch trader runs error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}



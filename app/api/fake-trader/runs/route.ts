import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const query = `
      SELECT 
        run_id,
        name,
        symbols,
        timeframe,
        strategy_name,
        strategy_version,
        params,
        seed,
        status,
        starting_capital,
        current_capital,
        max_concurrent_positions,
        started_at,
        last_update,
        stopped_at,
        error,
        created_at
      FROM ft_runs
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query);
    
    const runs = result.rows.map(row => ({
      ...row,
      symbols: Array.isArray(row.symbols) ? row.symbols : [],
      params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
      starting_capital: Number(row.starting_capital),
      current_capital: Number(row.current_capital)
    }));

    return NextResponse.json({ runs });

  } catch (error: any) {
    console.error('Fetch fake trading runs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fake trading runs', details: error.message },
      { status: 500 }
    );
  }
}
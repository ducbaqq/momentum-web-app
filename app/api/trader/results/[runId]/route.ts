import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    const result = await pool.query(
      `SELECT run_id, symbol, trades, wins, losses, pnl, fees, win_rate, sharpe, sortino, max_dd, profit_factor, exposure, turnover
       FROM trader_results
       WHERE run_id = $1
       ORDER BY symbol ASC`,
      [runId]
    );

    return NextResponse.json({ results: result.rows || [] });
  } catch (e: any) {
    console.error('Fetch trader results error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}



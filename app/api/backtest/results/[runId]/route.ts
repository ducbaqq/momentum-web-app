import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const runId = params.runId;
    
    if (!runId) {
      return NextResponse.json(
        { error: 'Missing runId parameter' },
        { status: 400 }
      );
    }

    const query = `
      SELECT 
        run_id,
        symbol,
        trades,
        wins,
        losses,
        pnl,
        fees,
        win_rate,
        sharpe,
        sortino,
        max_dd,
        profit_factor,
        exposure,
        turnover
      FROM bt_results
      WHERE run_id = $1
      ORDER BY symbol ASC
    `;
    
    const result = await pool.query(query, [runId]);
    
    const results = result.rows.map(row => ({
      ...row,
      pnl: Number(row.pnl),
      fees: Number(row.fees),
      win_rate: Number(row.win_rate),
      sharpe: Number(row.sharpe),
      sortino: Number(row.sortino),
      max_dd: Number(row.max_dd),
      profit_factor: Number(row.profit_factor),
      exposure: Number(row.exposure),
      turnover: Number(row.turnover)
    }));

    return NextResponse.json({ results });

  } catch (e: any) {
    console.error('Fetch results error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
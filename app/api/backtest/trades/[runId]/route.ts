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
        entry_ts,
        exit_ts,
        side,
        qty,
        entry_px,
        exit_px,
        pnl,
        fees,
        reason
      FROM bt_trades
      WHERE run_id = $1
      ORDER BY entry_ts ASC
    `;
    
    const result = await pool.query(query, [runId]);
    
    const trades = result.rows.map(row => ({
      ...row,
      qty: Number(row.qty),
      entry_px: Number(row.entry_px),
      exit_px: Number(row.exit_px),
      pnl: Number(row.pnl),
      fees: Number(row.fees)
    }));

    return NextResponse.json({ trades });

  } catch (e: any) {
    console.error('Fetch trades error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
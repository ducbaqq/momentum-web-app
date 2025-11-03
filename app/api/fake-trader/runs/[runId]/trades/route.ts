import { NextRequest, NextResponse } from 'next/server';
import { tradingPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    const query = `
      SELECT 
        trade_id,
        run_id,
        symbol,
        side,
        entry_ts,
        exit_ts,
        qty,
        entry_px,
        exit_px,
        realized_pnl,
        unrealized_pnl,
        fees,
        reason,
        leverage,
        status,
        created_at
      FROM ft_trades 
      WHERE run_id = $1
      ORDER BY entry_ts DESC
    `;
    
    const result = await tradingPool.query(query, [runId]);
    
    // Convert numeric fields to proper numbers
    const trades = result.rows.map(row => ({
      ...row,
      qty: Number(row.qty),
      entry_px: Number(row.entry_px),
      exit_px: row.exit_px ? Number(row.exit_px) : undefined,
      realized_pnl: Number(row.realized_pnl),
      unrealized_pnl: Number(row.unrealized_pnl),
      fees: Number(row.fees),
      leverage: Number(row.leverage),
    }));

    return NextResponse.json({ trades });

  } catch (e: any) {
    console.error('Fetch fake trading trades error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

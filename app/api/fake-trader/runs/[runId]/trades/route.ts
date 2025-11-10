import { NextRequest, NextResponse } from 'next/server';
import { tradingPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Query ft_positions_v2 (canonical model only) for closed positions
    const query = `
      SELECT 
        position_id,
        run_id,
        symbol,
        side,
        open_ts as entry_ts,
        close_ts as exit_ts,
        quantity_open as qty,
        entry_price_vwap as entry_px,
        exit_price_vwap as exit_px,
        realized_pnl,
        0 as unrealized_pnl,
        fees_total as fees,
        'canonical' as reason,
        leverage_effective as leverage,
        CASE WHEN status = 'CLOSED' THEN 'closed' ELSE 'open' END as status,
        created_at
      FROM ft_positions_v2 
      WHERE run_id = $1 AND status = 'CLOSED'
      ORDER BY close_ts DESC
    `;
    
    const result = await tradingPool.query(query, [runId]);
    
    // Convert numeric fields to proper numbers
    const trades = result.rows.map(row => ({
      trade_id: row.position_id,
      ...row,
      qty: Number(row.qty),
      entry_px: Number(row.entry_px),
      exit_px: row.exit_px ? Number(row.exit_px) : undefined,
      realized_pnl: Number(row.realized_pnl),
      unrealized_pnl: 0,
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

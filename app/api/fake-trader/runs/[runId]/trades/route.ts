import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Get closed positions from ft_positions_v2 as "trades"
    const query = `
      SELECT 
        position_id as trade_id,
        run_id,
        symbol,
        side,
        open_ts as entry_ts,
        close_ts as exit_ts,
        quantity_open + quantity_close as qty,
        entry_price_vwap as entry_px,
        exit_price_vwap as exit_px,
        realized_pnl,
        fees_total as fees,
        leverage_effective as leverage,
        'closed' as status,
        open_ts as created_at
      FROM ft_positions_v2 
      WHERE run_id = $1 AND status = 'CLOSED'
      ORDER BY close_ts DESC
    `;
    
    const result = await pool.query(query, [runId]);
    
    // Convert numeric fields to proper numbers
    const trades = result.rows.map(row => ({
      trade_id: row.trade_id,
      run_id: row.run_id,
      symbol: row.symbol,
      side: row.side,
      entry_ts: row.entry_ts,
      exit_ts: row.exit_ts,
      qty: Number(row.qty),
      entry_px: row.entry_px ? Number(row.entry_px) : undefined,
      exit_px: row.exit_px ? Number(row.exit_px) : undefined,
      realized_pnl: Number(row.realized_pnl),
      unrealized_pnl: 0, // Closed positions have no unrealized PnL
      fees: Number(row.fees),
      leverage: Number(row.leverage),
      status: row.status,
      reason: 'strategy_exit' // Default reason, could be enhanced
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

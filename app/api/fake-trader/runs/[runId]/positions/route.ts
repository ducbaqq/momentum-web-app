import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    const query = `
      SELECT 
        position_id,
        run_id,
        symbol,
        side,
        size,
        entry_price,
        current_price,
        unrealized_pnl,
        cost_basis,
        market_value,
        stop_loss,
        take_profit,
        leverage,
        opened_at,
        last_update,
        status
      FROM ft_positions 
      WHERE run_id = $1 AND status = 'open'
      ORDER BY opened_at DESC
    `;
    
    const result = await pool.query(query, [runId]);
    
    // Convert numeric fields to proper numbers
    const positions = result.rows.map(row => ({
      ...row,
      size: Number(row.size),
      entry_price: Number(row.entry_price),
      current_price: row.current_price ? Number(row.current_price) : undefined,
      unrealized_pnl: Number(row.unrealized_pnl),
      cost_basis: Number(row.cost_basis),
      market_value: row.market_value ? Number(row.market_value) : undefined,
      stop_loss: row.stop_loss ? Number(row.stop_loss) : undefined,
      take_profit: row.take_profit ? Number(row.take_profit) : undefined,
      leverage: Number(row.leverage),
    }));

    return NextResponse.json({ positions });

  } catch (e: any) {
    console.error('Fetch fake trading positions error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { tradingPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // First, try to get closed positions from ft_positions_v2 (new canonical model)
    const positionsQuery = `
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
    
    const positionsResult = await tradingPool.query(positionsQuery, [runId]);
    
    // If we have positions from the new model, use them
    if (positionsResult.rows.length > 0) {
      const trades = positionsResult.rows.map(row => ({
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
    }
    
    // Fallback: Get trades from ft_trades (old model) if no positions found
    const fallbackQuery = `
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
        leverage,
        status,
        reason
      FROM ft_trades
      WHERE run_id = $1
      ORDER BY entry_ts DESC
    `;
    
    const fallbackResult = await tradingPool.query(fallbackQuery, [runId]);
    
    // Convert numeric fields to proper numbers
    const trades = fallbackResult.rows.map(row => ({
      trade_id: row.trade_id,
      run_id: row.run_id,
      symbol: row.symbol,
      side: row.side,
      entry_ts: row.entry_ts,
      exit_ts: row.exit_ts,
      qty: Number(row.qty),
      entry_px: row.entry_px ? Number(row.entry_px) : undefined,
      exit_px: row.exit_px ? Number(row.exit_px) : undefined,
      realized_pnl: Number(row.realized_pnl || 0),
      unrealized_pnl: Number(row.unrealized_pnl || 0),
      fees: Number(row.fees || 0),
      leverage: Number(row.leverage || 1),
      status: row.status || 'closed',
      reason: row.reason || 'strategy_exit'
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

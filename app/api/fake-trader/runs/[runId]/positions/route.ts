import { NextRequest, NextResponse } from 'next/server';
import { tradingPool, dataPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Get open positions from ft_positions_v2
    const query = `
      SELECT 
        position_id,
        run_id,
        symbol,
        side,
        status,
        open_ts,
        close_ts,
        entry_price_vwap,
        exit_price_vwap,
        quantity_open,
        quantity_close,
        cost_basis,
        fees_total,
        realized_pnl,
        leverage_effective
      FROM ft_positions_v2 
      WHERE run_id = $1 AND status IN ('NEW', 'OPEN')
      ORDER BY open_ts DESC
    `;
    
    const result = await tradingPool.query(query, [runId]);
    
    // Get latest prices for unrealized PnL calculation
    const symbols = result.rows.map((r: any) => r.symbol);
    let priceMap: Record<string, number> = {};
    
    if (symbols.length > 0) {
      const priceQuery = `
        SELECT DISTINCT ON (symbol) symbol, close as price
        FROM ohlcv_1m
        WHERE symbol = ANY($1)
        ORDER BY symbol, ts DESC
      `;
      const priceResult = await dataPool.query(priceQuery, [symbols]);
      priceMap = Object.fromEntries(
        priceResult.rows.map((r: any) => [r.symbol, Number(r.price)])
      );
    }
    
    // Convert numeric fields and calculate unrealized PnL
    const positions = result.rows.map((row: any) => {
      const currentPrice = priceMap[row.symbol];
      let unrealizedPnl = 0;
      
      if (currentPrice && row.entry_price_vwap) {
        const entryPrice = Number(row.entry_price_vwap);
        const qty = Number(row.quantity_open);
        if (row.side === 'LONG') {
          unrealizedPnl = (currentPrice - entryPrice) * qty;
        } else {
          unrealizedPnl = (entryPrice - currentPrice) * qty;
        }
      }
      
      return {
        position_id: row.position_id,
        run_id: row.run_id,
        symbol: row.symbol,
        side: row.side,
        status: row.status,
        size: Number(row.quantity_open),
        entry_price: row.entry_price_vwap ? Number(row.entry_price_vwap) : undefined,
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
        cost_basis: Number(row.cost_basis),
        market_value: currentPrice ? currentPrice * Number(row.quantity_open) : undefined,
        leverage: Number(row.leverage_effective),
        opened_at: row.open_ts,
        closed_at: row.close_ts || undefined,
        fees_total: Number(row.fees_total),
        realized_pnl: Number(row.realized_pnl)
      };
    });

    return NextResponse.json({ positions });

  } catch (e: any) {
    console.error('Fetch fake trading positions error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

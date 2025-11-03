import { NextRequest, NextResponse } from 'next/server';
import { tradingPool, dataPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

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
      WHERE run_id = $1
    `;
    
    const result = await tradingPool.query(query, [runId]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Fake trading run not found' },
        { status: 404 }
      );
    }

    // Get latest account snapshot
    const snapshotQuery = `
      SELECT equity, cash, margin_used, exposure_gross, exposure_net, open_positions_count, ts
      FROM ft_account_snapshots
      WHERE run_id = $1
      ORDER BY ts DESC
      LIMIT 1
    `;
    const snapshotResult = await tradingPool.query(snapshotQuery, [runId]);

    // Get open positions for unrealized PnL calculation
    const openPositionsQuery = `
      SELECT position_id, symbol, side, entry_price_vwap, quantity_open, cost_basis
      FROM ft_positions_v2
      WHERE run_id = $1 AND status IN ('NEW', 'OPEN')
    `;
    const openPositionsResult = await tradingPool.query(openPositionsQuery, [runId]);

    // Get latest prices for open positions
    const symbols = openPositionsResult.rows.map((p: any) => p.symbol);
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

    // Calculate unrealized PnL
    let unrealizedPnl = 0;
    for (const pos of openPositionsResult.rows) {
      const currentPrice = priceMap[pos.symbol];
      if (currentPrice && pos.entry_price_vwap) {
        const entryPrice = Number(pos.entry_price_vwap);
        const qty = Number(pos.quantity_open);
        if (pos.side === 'LONG') {
          unrealizedPnl += (currentPrice - entryPrice) * qty;
        } else {
          unrealizedPnl += (entryPrice - currentPrice) * qty;
        }
      }
    }

    // Get total realized PnL from closed positions
    const realizedPnlQuery = `
      SELECT COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
             COALESCE(SUM(fees_total), 0) as total_fees
      FROM ft_positions_v2
      WHERE run_id = $1 AND status = 'CLOSED'
    `;
    const realizedPnlResult = await tradingPool.query(realizedPnlQuery, [runId]);
    const realizedPnl = Number(realizedPnlResult.rows[0].total_realized_pnl);
    const totalFees = Number(realizedPnlResult.rows[0].total_fees);

    // Use account snapshot if available
    const snapshot = snapshotResult.rows[0];
    const equity = snapshot ? Number(snapshot.equity) : Number(result.rows[0].current_capital);
    const cash = snapshot ? Number(snapshot.cash) : (Number(result.rows[0].current_capital) - Number(snapshot?.margin_used || 0));
    const marginUsed = snapshot ? Number(snapshot.margin_used) : 0;

    const run = {
      ...result.rows[0],
      symbols: Array.isArray(result.rows[0].symbols) ? result.rows[0].symbols : [],
      params: typeof result.rows[0].params === 'string' ? JSON.parse(result.rows[0].params) : result.rows[0].params,
      starting_capital: Number(result.rows[0].starting_capital),
      current_capital: Number(result.rows[0].current_capital),
      equity: equity,
      cash: cash,
      available_funds: cash,
      margin_used: marginUsed,
      realized_pnl: realizedPnl,
      unrealized_pnl: unrealizedPnl,
      total_pnl: realizedPnl + unrealizedPnl,
      total_fees: totalFees,
      open_positions_count: snapshot ? snapshot.open_positions_count : openPositionsResult.rows.length
    };

    return NextResponse.json({ run });

  } catch (e: any) {
    console.error('Fetch fake trading run error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;
    const body = await request.json();
    const { status, action } = body;

    // Handle special actions
    if (action === 'force_exit') {
      // Force exit all positions immediately
      await handleForceExit(runId);
      
      const updateQuery = `
        UPDATE ft_runs 
        SET status = 'stopped', last_update = NOW(), stopped_at = NOW()
        WHERE run_id = $1
        RETURNING *
      `;
      
      const result = await tradingPool.query(updateQuery, [runId]);
      
      return NextResponse.json({ 
        success: true, 
        message: 'All positions force exited and run stopped',
        run: result.rows[0]
      });
    }

    // Regular status updates
    if (!['active', 'paused', 'stopped', 'winding_down'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, paused, stopped, or winding_down' },
        { status: 400 }
      );
    }

    const query = `
      UPDATE ft_runs 
      SET status = $2, last_update = NOW(), stopped_at = CASE WHEN $2 = 'stopped' THEN NOW() ELSE stopped_at END
      WHERE run_id = $1
      RETURNING *
    `;
    
    const result = await tradingPool.query(query, [runId, status]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Fake trading run not found' },
        { status: 404 }
      );
    }

    let message = `Run ${status} successfully`;
    if (status === 'winding_down') {
      message = 'Run is winding down - no new positions will be opened';
    }

    return NextResponse.json({ 
      success: true, 
      message,
      run: result.rows[0]
    });

  } catch (e: any) {
    console.error('Update fake trading run error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleForceExit(runId: string) {
  // Get all open positions for this run
  const positionsQuery = `
    SELECT * FROM ft_positions 
    WHERE run_id = $1 AND status = 'open'
  `;
  
  const positions = await tradingPool.query(positionsQuery, [runId]);
  
  if (positions.rows.length === 0) {
    return; // No open positions to close
  }

  // Get current market prices for all symbols
  const symbols = [...new Set(positions.rows.map(p => p.symbol))];
  const candlesQuery = `
    SELECT DISTINCT ON (symbol) 
      symbol, close
    FROM ohlcv_1m 
    WHERE symbol = ANY($1)
    AND ts >= NOW() - INTERVAL '1 hour'
    ORDER BY symbol, ts DESC
  `;
  
  const candles = await dataPool.query(candlesQuery, [symbols]);
  const priceMap = Object.fromEntries(
    candles.rows.map(row => [row.symbol, parseFloat(row.close)])
  );

  // Close all positions at current market price
  for (const position of positions.rows) {
    const currentPrice = priceMap[position.symbol] || position.current_price;
    const realizedPnl = calculateRealizedPnL(position, currentPrice);
    const fees = position.size * currentPrice * 0.0004; // 0.04% fees

    // Create exit trade record
    await tradingPool.query(`
      INSERT INTO ft_trades (run_id, symbol, side, entry_ts, exit_ts, qty, entry_px, exit_px, realized_pnl, fees, reason, leverage, status)
      VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, 'force_exit', $10, 'closed')
    `, [
      runId,
      position.symbol,
      position.side,
      position.opened_at,
      position.size,
      position.entry_price,
      currentPrice,
      realizedPnl,
      fees,
      position.leverage
    ]);

    // Close the position
    await tradingPool.query(`
      UPDATE ft_positions
      SET status = 'closed', current_price = $2, unrealized_pnl = $3
      WHERE position_id = $1
    `, [position.position_id, currentPrice, realizedPnl]);

    // Update run capital - return margin + realized P&L - fees
    const capitalAdjustment = Number(position.cost_basis) + realizedPnl - fees;
    await tradingPool.query(`
      UPDATE ft_runs
      SET current_capital = current_capital + $2
      WHERE run_id = $1
    `, [runId, capitalAdjustment]);
  }
}

function calculateRealizedPnL(position: any, exitPrice: number): number {
  if (position.side === 'LONG') {
    return (exitPrice - position.entry_price) * position.size;
  } else {
    return (position.entry_price - exitPrice) * position.size;
  }
}
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

    // Get latest account snapshot (canonical model required)
    const snapshotQuery = `
      SELECT equity, cash, margin_used, exposure_gross, exposure_net, open_positions_count, ts
      FROM ft_account_snapshots
      WHERE run_id = $1
      ORDER BY ts DESC
      LIMIT 1
    `;
    const snapshotResult = await tradingPool.query(snapshotQuery, [runId]);
    
    // If no snapshot exists yet, use starting_capital as initial values
    const snapshot = snapshotResult.rows[0];
    const equity = snapshot ? Number(snapshot.equity) : Number(result.rows[0].starting_capital);
    const cash = snapshot ? Number(snapshot.cash) : Number(result.rows[0].starting_capital);
    const marginUsed = snapshot ? Number(snapshot.margin_used) : 0;

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
  // Get all open positions for this run (canonical model)
  const positionsQuery = `
    SELECT position_id, symbol, side, entry_price_vwap, quantity_open, cost_basis, leverage_effective
    FROM ft_positions_v2 
    WHERE run_id = $1 AND status IN ('NEW', 'OPEN')
  `;
  
  const positions = await tradingPool.query(positionsQuery, [runId]);
  
  if (positions.rows.length === 0) {
    return; // No open positions to close
  }

  // Get current market prices for all symbols
  const symbols = [...new Set(positions.rows.map((p: any) => p.symbol))];
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
    candles.rows.map((row: any) => [row.symbol, parseFloat(row.close)])
  );

  // Close all positions using canonical model
  for (const position of positions.rows) {
    const currentPrice = priceMap[position.symbol] || 0;
    if (!currentPrice) {
      console.error(`No price found for ${position.symbol}, skipping`);
      continue;
    }
    
    const entryPrice = Number(position.entry_price_vwap);
    const qty = Number(position.quantity_open);
    const side = position.side;
    
    // Calculate realized PnL
    let realizedPnl = 0;
    if (side === 'LONG') {
      realizedPnl = (currentPrice - entryPrice) * qty;
    } else {
      realizedPnl = (entryPrice - currentPrice) * qty;
    }
    
    const fees = qty * currentPrice * 0.0004; // 0.04% fees
    
    // Create EXIT order
    const exitOrderIdResult = await tradingPool.query(`
      INSERT INTO ft_orders (run_id, symbol, ts, side, type, qty, price, status, reason_tag, position_id)
      VALUES ($1, $2, NOW(), $3, 'EXIT', $4, $5, 'NEW', 'force_exit', $6)
      RETURNING order_id
    `, [runId, position.symbol, side, qty, currentPrice, position.position_id]);
    
    const orderId = exitOrderIdResult.rows[0].order_id;
    
    // Create EXIT fill
    await tradingPool.query(`
      INSERT INTO ft_fills (order_id, run_id, symbol, ts, qty, price, fee, position_id)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
    `, [orderId, runId, position.symbol, qty, currentPrice, fees, position.position_id]);
    
    // Update position from fills (recalculate metrics)
    const fillsResult = await tradingPool.query(`
      SELECT f.*, o.type as order_type
      FROM ft_fills f
      JOIN ft_orders o ON f.order_id = o.order_id
      WHERE f.position_id = $1
      ORDER BY f.ts ASC
    `, [position.position_id]);
    
    const fills = fillsResult.rows;
    const entryFills = fills.filter((f: any) => f.order_type === 'ENTRY');
    const exitFills = fills.filter((f: any) => f.order_type === 'EXIT');
    
    // Calculate VWAP entry price
    let entryVwap = null;
    if (entryFills.length > 0) {
      const totalQty = entryFills.reduce((sum: number, f: any) => sum + Number(f.qty), 0);
      const totalCost = entryFills.reduce((sum: number, f: any) => sum + Number(f.qty) * Number(f.price), 0);
      if (totalQty > 0) {
        entryVwap = totalCost / totalQty;
      }
    }
    
    // Calculate VWAP exit price
    let exitVwap = null;
    if (exitFills.length > 0) {
      const totalQty = exitFills.reduce((sum: number, f: any) => sum + Number(f.qty), 0);
      const totalValue = exitFills.reduce((sum: number, f: any) => sum + Number(f.qty) * Number(f.price), 0);
      if (totalQty > 0) {
        exitVwap = totalValue / totalQty;
      }
    }
    
    // Calculate realized PnL from fills
    let calculatedRealizedPnl = 0;
    let quantityOpen = 0;
    let costBasis = 0;
    let feesTotal = 0;
    
    for (const fill of fills) {
      feesTotal += Number(fill.fee);
      if (fill.order_type === 'ENTRY') {
        quantityOpen += Number(fill.qty);
        costBasis += Number(fill.qty) * Number(fill.price);
      } else if (fill.order_type === 'EXIT') {
        quantityOpen -= Number(fill.qty);
        // Calculate PnL for this exit fill
        if (side === 'LONG' && entryVwap) {
          calculatedRealizedPnl += (Number(fill.price) - entryVwap) * Number(fill.qty);
        } else if (side === 'SHORT' && entryVwap) {
          calculatedRealizedPnl += (entryVwap - Number(fill.price)) * Number(fill.qty);
        }
      }
    }
    
    // Update position with calculated values
    await tradingPool.query(`
      UPDATE ft_positions_v2
      SET 
        entry_price_vwap = $2,
        exit_price_vwap = $3,
        quantity_open = $4,
        quantity_close = $5,
        cost_basis = $6,
        fees_total = $7,
        realized_pnl = $8,
        status = 'CLOSED',
        close_ts = NOW(),
        updated_at = NOW()
      WHERE position_id = $1
    `, [
      position.position_id,
      entryVwap,
      exitVwap,
      quantityOpen,
      exitFills.reduce((sum: number, f: any) => sum + Number(f.qty), 0),
      costBasis,
      feesTotal,
      calculatedRealizedPnl
    ]);
    
    // Update run capital - return margin + realized P&L - fees
    const capitalAdjustment = Number(position.cost_basis) + calculatedRealizedPnl - feesTotal;
    await tradingPool.query(`
      UPDATE ft_runs
      SET current_capital = current_capital + $2
      WHERE run_id = $1
    `, [runId, capitalAdjustment]);
  }
}
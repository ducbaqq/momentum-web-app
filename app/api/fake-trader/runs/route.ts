import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get('run_id');
    const deleteAll = url.searchParams.get('all') === 'true';
    
    // Start a transaction to delete all related data
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (deleteAll) {
        // First get the count before deleting
        const countResult = await client.query('SELECT COUNT(*) as count FROM ft_runs');
        const deletedCount = parseInt(countResult.rows[0]?.count || '0');
        
        // Delete all fake trader runs and their related data
        // Delete canonical model tables first (foreign key constraints)
        const deletedEvents = await client.query('DELETE FROM ft_events WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedPriceSnapshots = await client.query('DELETE FROM ft_price_snapshots WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedFills = await client.query('DELETE FROM ft_fills WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedOrders = await client.query('DELETE FROM ft_orders WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedAccountSnapshots = await client.query('DELETE FROM ft_account_snapshots WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedPositionsV2 = await client.query('DELETE FROM ft_positions_v2 WHERE run_id IN (SELECT run_id FROM ft_runs)');
        
        // Delete legacy tables if they exist
        const deletedTrades = await client.query('DELETE FROM ft_trades WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedResults = await client.query('DELETE FROM ft_results WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedEquity = await client.query('DELETE FROM ft_equity WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedPositions = await client.query('DELETE FROM ft_positions WHERE run_id IN (SELECT run_id FROM ft_runs)');
        const deletedRuns = await client.query('DELETE FROM ft_runs');
        
        await client.query('COMMIT');
        
        console.log('Deleted all fake trader runs:', {
          runs: deletedCount,
          canonical: {
            events: deletedEvents.rowCount,
            priceSnapshots: deletedPriceSnapshots.rowCount,
            fills: deletedFills.rowCount,
            orders: deletedOrders.rowCount,
            accountSnapshots: deletedAccountSnapshots.rowCount,
            positionsV2: deletedPositionsV2.rowCount
          },
          legacy: {
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount,
            positions: deletedPositions.rowCount
          }
        });
        
        return NextResponse.json({
          success: true,
          message: `All ${deletedCount} fake trader runs deleted successfully`,
          deleted: {
            runs: deletedCount,
            canonical: {
              events: deletedEvents.rowCount,
              priceSnapshots: deletedPriceSnapshots.rowCount,
              fills: deletedFills.rowCount,
              orders: deletedOrders.rowCount,
              accountSnapshots: deletedAccountSnapshots.rowCount,
              positionsV2: deletedPositionsV2.rowCount
            },
            legacy: {
              trades: deletedTrades.rowCount,
              results: deletedResults.rowCount,
              equity: deletedEquity.rowCount,
              positions: deletedPositions.rowCount
            }
          }
        });
        
      } else {
        // Delete individual run
        if (!runId) {
          return NextResponse.json(
            { error: 'run_id parameter is required for individual deletion' },
            { status: 400 }
          );
        }

        // Delete related data in the correct order (foreign key constraints)
        // 1. Delete canonical model tables first
        const deletedEvents = await client.query('DELETE FROM ft_events WHERE run_id = $1', [runId]);
        const deletedPriceSnapshots = await client.query('DELETE FROM ft_price_snapshots WHERE run_id = $1', [runId]);
        const deletedFills = await client.query('DELETE FROM ft_fills WHERE run_id = $1', [runId]);
        const deletedOrders = await client.query('DELETE FROM ft_orders WHERE run_id = $1', [runId]);
        const deletedAccountSnapshots = await client.query('DELETE FROM ft_account_snapshots WHERE run_id = $1', [runId]);
        const deletedPositionsV2 = await client.query('DELETE FROM ft_positions_v2 WHERE run_id = $1', [runId]);
        
        // 2. Delete legacy tables if they exist
        const deletedTrades = await client.query('DELETE FROM ft_trades WHERE run_id = $1', [runId]);
        const deletedResults = await client.query('DELETE FROM ft_results WHERE run_id = $1', [runId]);
        const deletedEquity = await client.query('DELETE FROM ft_equity WHERE run_id = $1', [runId]);
        const deletedPositions = await client.query('DELETE FROM ft_positions WHERE run_id = $1', [runId]);
        
        // 3. Finally delete the run itself
        const deletedRun = await client.query('DELETE FROM ft_runs WHERE run_id = $1 RETURNING name', [runId]);
        
        if (deletedRun.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Fake trader run not found' },
            { status: 404 }
          );
        }
        
        await client.query('COMMIT');
        
        console.log(`Deleted fake trader run ${runId}:`, {
          canonical: {
            events: deletedEvents.rowCount,
            priceSnapshots: deletedPriceSnapshots.rowCount,
            fills: deletedFills.rowCount,
            orders: deletedOrders.rowCount,
            accountSnapshots: deletedAccountSnapshots.rowCount,
            positionsV2: deletedPositionsV2.rowCount
          },
          legacy: {
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount,
            positions: deletedPositions.rowCount
          },
          run: deletedRun.rows[0]?.name || 'Unnamed'
        });
        
        return NextResponse.json({
          success: true,
          message: `Fake trader "${deletedRun.rows[0]?.name || 'Unnamed'}" deleted successfully`,
          deleted: {
            canonical: {
              events: deletedEvents.rowCount,
              priceSnapshots: deletedPriceSnapshots.rowCount,
              fills: deletedFills.rowCount,
              orders: deletedOrders.rowCount,
              accountSnapshots: deletedAccountSnapshots.rowCount,
              positionsV2: deletedPositionsV2.rowCount
            },
            legacy: {
              trades: deletedTrades.rowCount,
              results: deletedResults.rowCount,
              equity: deletedEquity.rowCount,
              positions: deletedPositions.rowCount
            }
          }
        });
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (e: any) {
    console.error('Delete fake trader error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // First get all runs
    const runsQuery = `
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
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const runsResult = await pool.query(runsQuery);

    // For each run, get latest account snapshot and calculate metrics
    const runsWithMetrics = await Promise.all(
      runsResult.rows.map(async (row) => {
        const runId = row.run_id;

        // Get latest account snapshot
        const snapshotQuery = `
          SELECT equity, cash, margin_used, exposure_gross, exposure_net, open_positions_count
          FROM ft_account_snapshots
          WHERE run_id = $1
          ORDER BY ts DESC
          LIMIT 1
        `;
        const snapshotResult = await pool.query(snapshotQuery, [runId]);

        // Get open positions for unrealized PnL calculation
        const openPositionsQuery = `
          SELECT position_id, symbol, side, entry_price_vwap, quantity_open, cost_basis
          FROM ft_positions_v2
          WHERE run_id = $1 AND status IN ('NEW', 'OPEN')
        `;
        const openPositionsResult = await pool.query(openPositionsQuery, [runId]);

        // Get latest prices for open positions to calculate unrealized PnL
        const symbols = openPositionsResult.rows.map((p: any) => p.symbol);
        let priceMap: Record<string, number> = {};
        
        if (symbols.length > 0) {
          const priceQuery = `
            SELECT DISTINCT ON (symbol) symbol, close as price
            FROM ohlcv_1m
            WHERE symbol = ANY($1)
            ORDER BY symbol, ts DESC
          `;
          const priceResult = await pool.query(priceQuery, [symbols]);
          priceMap = Object.fromEntries(
            priceResult.rows.map((r: any) => [r.symbol, Number(r.price)])
          );
        }

        // Calculate unrealized PnL from open positions
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
          SELECT COALESCE(SUM(realized_pnl), 0) as total_realized_pnl
          FROM ft_positions_v2
          WHERE run_id = $1 AND status = 'CLOSED'
        `;
        const realizedPnlResult = await pool.query(realizedPnlQuery, [runId]);
        const realizedPnl = Number(realizedPnlResult.rows[0].total_realized_pnl);

        // Use account snapshot if available, otherwise fall back to current_capital
        const snapshot = snapshotResult.rows[0];
        const equity = snapshot ? Number(snapshot.equity) : Number(row.current_capital);
        const cash = snapshot ? Number(snapshot.cash) : (Number(row.current_capital) - Number(snapshot?.margin_used || 0));
        const marginUsed = snapshot ? Number(snapshot.margin_used) : 0;
        const availableFunds = cash;

        return {
          ...row,
          symbols: Array.isArray(row.symbols) ? row.symbols : [],
          params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
          starting_capital: Number(row.starting_capital),
          current_capital: Number(row.current_capital),
          available_funds: availableFunds,
          equity: equity,
          cash: cash,
          margin_used: marginUsed,
          realized_pnl: realizedPnl,
          unrealized_pnl: unrealizedPnl,
          total_pnl: realizedPnl + unrealizedPnl,
          open_positions_count: snapshot ? snapshot.open_positions_count : openPositionsResult.rows.length
        };
      })
    );

    return NextResponse.json({ runs: runsWithMetrics });

  } catch (error: any) {
    console.error('Fetch fake trading runs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fake trading runs', details: error.message },
      { status: 500 }
    );
  }
}
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
        const deletedTrades = await client.query('DELETE FROM ft_trades');
        const deletedResults = await client.query('DELETE FROM ft_results');
        const deletedEquity = await client.query('DELETE FROM ft_equity');
        const deletedPositions = await client.query('DELETE FROM ft_positions');
        const deletedRuns = await client.query('DELETE FROM ft_runs');
        
        await client.query('COMMIT');
        
        console.log('Deleted all fake trader runs:', {
          runs: deletedCount,
          trades: deletedTrades.rowCount,
          results: deletedResults.rowCount,
          equity: deletedEquity.rowCount,
          positions: deletedPositions.rowCount
        });
        
        return NextResponse.json({
          success: true,
          message: `All ${deletedCount} fake trader runs deleted successfully`,
          deleted: {
            runs: deletedCount,
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount,
            positions: deletedPositions.rowCount
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
        // 1. Delete trades first
        const deletedTrades = await client.query(
          'DELETE FROM ft_trades WHERE run_id = $1',
          [runId]
        );
        
        // 2. Delete results
        const deletedResults = await client.query(
          'DELETE FROM ft_results WHERE run_id = $1',
          [runId]
        );
        
        // 3. Delete equity records
        const deletedEquity = await client.query(
          'DELETE FROM ft_equity WHERE run_id = $1',
          [runId]
        );
        
        // 4. Delete positions
        const deletedPositions = await client.query(
          'DELETE FROM ft_positions WHERE run_id = $1',
          [runId]
        );
        
        // 5. Finally delete the run itself
        const deletedRun = await client.query(
          'DELETE FROM ft_runs WHERE run_id = $1 RETURNING name',
          [runId]
        );
        
        if (deletedRun.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Fake trader run not found' },
            { status: 404 }
          );
        }
        
        await client.query('COMMIT');
        
        console.log(`Deleted fake trader run ${runId}:`, {
          trades: deletedTrades.rowCount,
          results: deletedResults.rowCount,
          equity: deletedEquity.rowCount,
          positions: deletedPositions.rowCount,
          run: deletedRun.rows[0]?.name || 'Unnamed'
        });
        
        return NextResponse.json({
          success: true,
          message: `Fake trader "${deletedRun.rows[0]?.name || 'Unnamed'}" deleted successfully`,
          deleted: {
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount,
            positions: deletedPositions.rowCount
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

    // For each run, calculate available funds (current_capital - margin invested in open positions)
    const runsWithAvailableFunds = await Promise.all(
      runsResult.rows.map(async (row) => {
        const runId = row.run_id;

        // Get margin invested in open positions for this run
        const marginQuery = `
          SELECT COALESCE(SUM(cost_basis), 0) as margin_invested
          FROM ft_positions
          WHERE run_id = $1 AND status = 'open'
        `;

        const marginResult = await pool.query(marginQuery, [runId]);
        const marginInvested = Number(marginResult.rows[0].margin_invested);

        const currentCapital = Number(row.current_capital);
        const availableFunds = currentCapital - marginInvested;

        return {
          ...row,
          symbols: Array.isArray(row.symbols) ? row.symbols : [],
          params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
          starting_capital: Number(row.starting_capital),
          current_capital: currentCapital,
          available_funds: availableFunds
        };
      })
    );

    return NextResponse.json({ runs: runsWithAvailableFunds });

  } catch (error: any) {
    console.error('Fetch fake trading runs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fake trading runs', details: error.message },
      { status: 500 }
    );
  }
}
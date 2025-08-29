import { NextResponse } from 'next/server';
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
        const countResult = await client.query('SELECT COUNT(*) as count FROM bt_runs');
        const deletedCount = parseInt(countResult.rows[0]?.count || '0');
        
        // Delete all backtest runs and their related data
        const deletedTrades = await client.query('DELETE FROM bt_trades');
        const deletedResults = await client.query('DELETE FROM bt_results');
        const deletedEquity = await client.query('DELETE FROM bt_equity');
        const deletedRuns = await client.query('DELETE FROM bt_runs');
        
        await client.query('COMMIT');
        
        console.log('Deleted all backtest runs:', {
          runs: deletedCount,
          trades: deletedTrades.rowCount,
          results: deletedResults.rowCount,
          equity: deletedEquity.rowCount
        });
        
        return NextResponse.json({
          success: true,
          message: `All ${deletedCount} backtest runs deleted successfully`,
          deleted: {
            runs: deletedCount,
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount
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
          'DELETE FROM bt_trades WHERE run_id = $1',
          [runId]
        );
        
        // 2. Delete results
        const deletedResults = await client.query(
          'DELETE FROM bt_results WHERE run_id = $1',
          [runId]
        );
        
        // 3. Delete equity records
        const deletedEquity = await client.query(
          'DELETE FROM bt_equity WHERE run_id = $1',
          [runId]
        );
        
        // 4. Finally delete the run itself
        const deletedRun = await client.query(
          'DELETE FROM bt_runs WHERE run_id = $1 RETURNING name',
          [runId]
        );
        
        if (deletedRun.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Backtest run not found' },
            { status: 404 }
          );
        }
        
        await client.query('COMMIT');
        
        console.log(`Deleted backtest run ${runId}:`, {
          trades: deletedTrades.rowCount,
          results: deletedResults.rowCount,
          equity: deletedEquity.rowCount,
          run: deletedRun.rows[0]?.name || 'Unnamed'
        });
        
        return NextResponse.json({
          success: true,
          message: `Backtest "${deletedRun.rows[0]?.name || 'Unnamed'}" deleted successfully`,
          deleted: {
            trades: deletedTrades.rowCount,
            results: deletedResults.rowCount,
            equity: deletedEquity.rowCount
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
    console.error('Delete backtest error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Try to get column information first to handle missing 'error' column gracefully
    let query = `
      SELECT 
        r.run_id,
        r.name,
        r.start_ts,
        r.end_ts,
        r.symbols,
        r.timeframe,
        r.strategy_name,
        r.strategy_version,
        r.params,
        r.seed,
        r.status,
        r.created_at,
        COALESCE(r.params->>'starting_capital', '0')::numeric as starting_capital,
        COALESCE(res.total_pnl, 0) as total_pnl,
        COALESCE(r.params->>'starting_capital', '0')::numeric + COALESCE(res.total_pnl, 0) as ending_capital
      FROM bt_runs r
      LEFT JOIN (
        SELECT 
          run_id, 
          SUM(pnl) as total_pnl 
        FROM bt_results 
        GROUP BY run_id
      ) res ON r.run_id = res.run_id
      ORDER BY r.created_at DESC
      LIMIT 50
    `;
    
    // Try to add error column if it exists
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bt_runs' AND column_name = 'error'
      `);
      
      if (columnCheck.rows.length > 0) {
        query = `
          SELECT 
            r.run_id,
            r.name,
            r.start_ts,
            r.end_ts,
            r.symbols,
            r.timeframe,
            r.strategy_name,
            r.strategy_version,
            r.params,
            r.seed,
            r.status,
            r.created_at,
            r.error,
            COALESCE(r.params->>'starting_capital', '0')::numeric as starting_capital,
            COALESCE(res.total_pnl, 0) as total_pnl,
            COALESCE(r.params->>'starting_capital', '0')::numeric + COALESCE(res.total_pnl, 0) as ending_capital
          FROM bt_runs r
          LEFT JOIN (
            SELECT 
              run_id, 
              SUM(pnl) as total_pnl 
            FROM bt_results 
            GROUP BY run_id
          ) res ON r.run_id = res.run_id
          ORDER BY r.created_at DESC
          LIMIT 50
        `;
      }
    } catch (colErr) {
      // If we can't check for the column, just proceed with the basic query
      console.log('Could not check for error column, using basic query');
    }
    
    const result = await pool.query(query);
    
    const runs = result.rows.map(row => ({
      ...row,
      symbols: Array.isArray(row.symbols) ? row.symbols : [],
      params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
      error: row.error || null, // Ensure error field exists even if column is missing
      // Ensure capital fields are numbers
      starting_capital: parseFloat(row.starting_capital) || 0,
      total_pnl: parseFloat(row.total_pnl) || 0,
      ending_capital: parseFloat(row.ending_capital) || 0
    }));

    return NextResponse.json({ runs });

  } catch (e: any) {
    console.error('Fetch runs error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
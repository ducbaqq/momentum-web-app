import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Try to get column information first to handle missing 'error' column gracefully
    let query = `
      SELECT 
        run_id,
        name,
        start_ts,
        end_ts,
        symbols,
        timeframe,
        strategy_name,
        strategy_version,
        params,
        seed,
        status,
        created_at
      FROM bt_runs
      WHERE run_id = $1
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
            run_id,
            name,
            start_ts,
            end_ts,
            symbols,
            timeframe,
            strategy_name,
            strategy_version,
            params,
            seed,
            status,
            created_at,
            error
          FROM bt_runs
          WHERE run_id = $1
        `;
      }
    } catch (colErr) {
      // If we can't check for the column, just proceed with the basic query
      console.log('Could not check for error column, using basic query');
    }
    
    const result = await pool.query(query, [runId]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Backtest run not found' },
        { status: 404 }
      );
    }

    const run = {
      ...result.rows[0],
      symbols: Array.isArray(result.rows[0].symbols) ? result.rows[0].symbols : [],
      params: typeof result.rows[0].params === 'string' ? JSON.parse(result.rows[0].params) : result.rows[0].params,
      error: result.rows[0].error || null // Ensure error field exists even if column is missing
    };

    return NextResponse.json({ run });

  } catch (e: any) {
    console.error('Fetch run error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
      ORDER BY created_at DESC
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
          ORDER BY created_at DESC
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
      error: row.error || null // Ensure error field exists even if column is missing
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
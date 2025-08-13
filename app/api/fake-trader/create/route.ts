import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      name,
      symbols,
      timeframe = '15m',
      strategy_name,
      strategy_version = '1.0',
      starting_capital = 10000,
      max_concurrent_positions = 3,
      params = {},
      seed
    } = body;

    // Validate required fields
    if (!name || !symbols || !Array.isArray(symbols) || symbols.length === 0 || !strategy_name) {
      return NextResponse.json(
        { error: 'Missing required fields: name, symbols, strategy_name' },
        { status: 400 }
      );
    }

    // Insert new fake trading run
    const query = `
      INSERT INTO ft_runs (
        name, symbols, timeframe, strategy_name, strategy_version,
        starting_capital, current_capital, max_concurrent_positions, params, seed, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, 'active')
      RETURNING run_id, created_at
    `;
    
    const values = [
      name,
      symbols,
      timeframe,
      strategy_name,
      strategy_version,
      starting_capital,
      max_concurrent_positions,
      JSON.stringify(params),
      seed || Math.floor(Math.random() * 1000000)
    ];

    const result = await pool.query(query, values);
    const run = result.rows[0];

    // Initialize results for each symbol
    const resultQueries = symbols.map((symbol: string) => {
      return pool.query(`
        INSERT INTO ft_results (run_id, symbol)
        VALUES ($1, $2)
      `, [run.run_id, symbol]);
    });

    await Promise.all(resultQueries);

    return NextResponse.json({
      success: true,
      run_id: run.run_id,
      created_at: run.created_at,
      message: 'Fake trading run started successfully'
    });

  } catch (error: any) {
    console.error('Create fake trading run error:', error);
    return NextResponse.json(
      { error: 'Failed to create fake trading run', details: error.message },
      { status: 500 }
    );
  }
}
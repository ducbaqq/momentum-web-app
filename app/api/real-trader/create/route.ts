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
      max_position_size_usd = 1000,
      daily_loss_limit_pct = 5.0,
      max_drawdown_pct = 10.0,
      testnet = true, // Default to testnet for safety
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

    // Additional validation for real trading
    if (starting_capital < 100) {
      return NextResponse.json(
        { error: 'Starting capital must be at least $100' },
        { status: 400 }
      );
    }

    if (max_position_size_usd > starting_capital) {
      return NextResponse.json(
        { error: 'Max position size cannot exceed starting capital' },
        { status: 400 }
      );
    }

    // Insert new real trading run
    const query = `
      INSERT INTO rt_runs (
        name, symbols, timeframe, strategy_name, strategy_version,
        starting_capital, current_capital, max_concurrent_positions, max_position_size_usd,
        daily_loss_limit_pct, max_drawdown_pct, testnet, params, seed, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
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
      max_position_size_usd,
      daily_loss_limit_pct,
      max_drawdown_pct,
      testnet,
      JSON.stringify(params),
      seed || Math.floor(Math.random() * 1000000)
    ];

    const result = await pool.query(query, values);
    const run = result.rows[0];

    // Initialize results for each symbol
    const resultQueries = symbols.map((symbol: string) => {
      return pool.query(`
        INSERT INTO rt_results (run_id, symbol)
        VALUES ($1, $2)
      `, [run.run_id, symbol]);
    });

    await Promise.all(resultQueries);

    return NextResponse.json({
      success: true,
      run_id: run.run_id,
      created_at: run.created_at,
      testnet: testnet,
      message: `Real trading run started successfully on ${testnet ? 'TESTNET' : 'MAINNET'}`
    });

  } catch (error: any) {
    console.error('Create real trading run error:', error);
    return NextResponse.json(
      { error: 'Failed to create real trading run', details: error.message },
      { status: 500 }
    );
  }
}
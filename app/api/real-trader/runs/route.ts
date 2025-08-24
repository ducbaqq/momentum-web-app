import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
        starting_capital::numeric as starting_capital,
        current_capital::numeric as current_capital,
        max_concurrent_positions,
        max_position_size_usd::numeric as max_position_size_usd,
        daily_loss_limit_pct::numeric as daily_loss_limit_pct,
        max_drawdown_pct::numeric as max_drawdown_pct,
        testnet,
        started_at,
        last_update,
        stopped_at,
        error,
        created_at
      FROM rt_runs
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await pool.query(query);
    
    // Convert numeric fields and ensure proper types
    const runs = result.rows.map(run => ({
      ...run,
      starting_capital: Number(run.starting_capital),
      current_capital: Number(run.current_capital),
      max_position_size_usd: Number(run.max_position_size_usd),
      daily_loss_limit_pct: Number(run.daily_loss_limit_pct),
      max_drawdown_pct: Number(run.max_drawdown_pct),
    }));

    return NextResponse.json({
      runs,
      count: runs.length
    });

  } catch (error: any) {
    console.error('Get real trading runs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch real trading runs', details: error.message },
      { status: 500 }
    );
  }
}
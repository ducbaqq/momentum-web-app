import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      start_ts,
      end_ts,
      symbols,
      timeframe = '15m',
      strategy_name,
      strategy_version = '1.0',
      starting_capital,
      params,
      execution,
      seed = Math.floor(Math.random() * 1000000)
    } = body;

    if (!start_ts || !end_ts || !symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: start_ts, end_ts, symbols' },
        { status: 400 }
      );
    }

    if (!strategy_name) {
      return NextResponse.json(
        { error: 'Missing required field: strategy_name' },
        { status: 400 }
      );
    }

    const runId = uuidv4();

    await pool.query(
      `INSERT INTO trader_runs 
       (run_id, name, start_ts, end_ts, symbols, timeframe, strategy_name, strategy_version, params, seed, status, created_at, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued', NOW(), NULL)`,
      [
        runId,
        name || null,
        start_ts,
        end_ts,
        symbols,
        timeframe,
        strategy_name,
        strategy_version,
        JSON.stringify({ ...params, ...execution, starting_capital }),
        seed
      ]
    );

    return NextResponse.json({ success: true, run_id: runId, message: 'Trader run queued successfully' });
  } catch (e: any) {
    console.error('Create trader run error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}



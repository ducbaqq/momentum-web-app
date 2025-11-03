#!/usr/bin/env tsx
/**
 * Export fake trader trade data minute-by-minute to CSV
 * Usage: tsx export-trade-csv.ts <trade_id_or_run_id>
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const TRADE_ID = process.argv[2];

if (!TRADE_ID) {
  console.error('Usage: tsx export-trade-csv.ts <trade_id_or_run_id>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Also try fetching via web app API as fallback
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://momentum-web-app-ng7fd.ondigitalocean.app';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

interface TradeRow {
  timestamp: string;
  symbol: string;
  event_type: string;
  side: string | null;
  entry_price: number | null;
  exit_price: number | null;
  current_price: number | null;
  quantity: number | null;
  position_size: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  fees: number | null;
  leverage: number | null;
  status: string | null;
  reason: string | null;
  rejection_reason: string | null;
  executed: boolean | null;
  market_value: number | null;
  cost_basis: number | null;
  run_capital: number | null;
  open_positions_count: number | null;
  notes: string | null;
}

async function exportTradeData() {
  console.log(`🔍 Looking up trade/run: ${TRADE_ID}\n`);

  // First, check if it's a run_id or trade_id
  const runCheck = await pool.query('SELECT run_id, symbol FROM ft_trades WHERE trade_id = $1 LIMIT 1', [TRADE_ID]);
  const runIdCheck = await pool.query('SELECT run_id, name FROM ft_runs WHERE run_id = $1 LIMIT 1', [TRADE_ID]);

  let runId: string;
  let tradeId: string | null = null;
  let runName: string;

  if (runCheck.rows.length > 0) {
    // It's a trade_id
    tradeId = TRADE_ID;
    runId = runCheck.rows[0].run_id;
    const runInfo = await pool.query('SELECT name FROM ft_runs WHERE run_id = $1', [runId]);
    runName = runInfo.rows[0]?.name || `Run ${runId.substring(0, 8)}`;
    console.log(`✓ Found trade_id, associated run: ${runId.substring(0, 8)}...`);
  } else if (runIdCheck.rows.length > 0) {
    // It's a run_id
    runId = TRADE_ID;
    runName = runIdCheck.rows[0].name || `Run ${runId.substring(0, 8)}`;
    console.log(`✓ Found run_id`);
  } else {
    // Neither trade_id nor run_id found - try fetching from web app API as fallback
    console.log(`⚠️  Run not found in database. Trying web app API...`);
    try {
      const apiRes = await fetch(`${WEB_APP_URL}/api/fake-trader/runs/${TRADE_ID}`);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.run) {
          console.log(`✓ Found run via web app API: ${apiData.run.name || 'Unnamed'}`);
          runId = TRADE_ID;
          runName = apiData.run.name || `Run ${runId.substring(0, 8)}`;
          
          // Fetch trades and positions from API
          const [tradesRes, positionsRes] = await Promise.all([
            fetch(`${WEB_APP_URL}/api/fake-trader/runs/${TRADE_ID}/trades`),
            fetch(`${WEB_APP_URL}/api/fake-trader/runs/${TRADE_ID}/positions`)
          ]);
          
          const tradesData = tradesRes.ok ? await tradesRes.json() : { trades: [] };
          const positionsData = positionsRes.ok ? await positionsRes.json() : { positions: [] };
          
          // Use API data instead of DB queries
          const trades = tradesData.trades || [];
          const positions = positionsData.positions || [];
          const run = apiData.run;
          
          console.log(`✓ Found ${trades.length} trade(s) via API`);
          console.log(`✓ Found ${positions.length} position(s) via API`);
          
          // Get symbols and time range
          const symbols = [...new Set(trades.map((t: any) => t.symbol))];
          const allTimestamps = trades.flatMap((t: any) => [t.entry_ts, t.exit_ts].filter(Boolean));
          const startTime = new Date(Math.min(...allTimestamps.map((ts: string) => new Date(ts).getTime())));
          const endTime = new Date(Math.max(...allTimestamps.map((ts: string) => new Date(ts).getTime())));
          
          // Extend time range
          startTime.setHours(startTime.getHours() - 1);
          endTime.setHours(endTime.getHours() + 1);
          
          console.log(`📊 Fetching minute-by-minute OHLCV data from ${startTime.toISOString()} to ${endTime.toISOString()}...`);
          
          // Fetch OHLCV data from database
          const ohlcvQuery = `
            SELECT symbol, ts, open, high, low, close, volume
            FROM ohlcv_1m
            WHERE symbol = ANY($1)
              AND ts >= $2
              AND ts <= $3
            ORDER BY ts, symbol
          `;
          const ohlcvResult = await pool.query(ohlcvQuery, [symbols, startTime.toISOString(), endTime.toISOString()]);
          const candles = ohlcvResult.rows;
          console.log(`✓ Found ${candles.length} minute candles`);
          
          // Build timeline with all events
          const timeline: Record<string, TradeRow[]> = {};
          const getMinuteKey = (ts: string | Date): string => {
            const d = typeof ts === 'string' ? new Date(ts) : ts;
            return d.toISOString().substring(0, 16) + ':00.000Z';
          };
          
          // Add trades
          for (const trade of trades) {
            const entryMinute = getMinuteKey(trade.entry_ts);
            if (!timeline[entryMinute]) timeline[entryMinute] = [];
            timeline[entryMinute].push({
              timestamp: trade.entry_ts,
              symbol: trade.symbol,
              event_type: 'TRADE_ENTRY',
              side: trade.side,
              entry_price: trade.entry_px,
              exit_price: null,
              current_price: trade.entry_px,
              quantity: trade.qty,
              position_size: trade.qty,
              unrealized_pnl: trade.unrealized_pnl || 0,
              realized_pnl: 0,
              fees: trade.fees,
              leverage: trade.leverage || 1,
              status: trade.status,
              reason: trade.reason || null,
              rejection_reason: null,
              executed: true,
              market_value: null,
              cost_basis: null,
              run_capital: run.current_capital,
              open_positions_count: null,
              notes: `Trade ${trade.trade_id.substring(0, 8)} opened`,
            });
            
            if (trade.exit_ts) {
              const exitMinute = getMinuteKey(trade.exit_ts);
              if (!timeline[exitMinute]) timeline[exitMinute] = [];
              timeline[exitMinute].push({
                timestamp: trade.exit_ts,
                symbol: trade.symbol,
                event_type: 'TRADE_EXIT',
                side: trade.side,
                entry_price: trade.entry_px,
                exit_price: trade.exit_px || trade.entry_px,
                current_price: trade.exit_px || trade.entry_px,
                quantity: trade.qty,
                position_size: null,
                unrealized_pnl: null,
                realized_pnl: trade.realized_pnl || 0,
                fees: trade.fees,
                leverage: trade.leverage || 1,
                status: trade.status,
                reason: trade.reason || null,
                rejection_reason: null,
                executed: true,
                market_value: null,
                cost_basis: null,
                run_capital: run.current_capital,
                open_positions_count: null,
                notes: `Trade ${trade.trade_id.substring(0, 8)} closed`,
              });
            }
          }
          
          // Add positions
          for (const position of positions) {
            const posMinute = getMinuteKey(position.last_update || position.opened_at);
            if (!timeline[posMinute]) timeline[posMinute] = [];
            timeline[posMinute].push({
              timestamp: position.last_update || position.opened_at,
              symbol: position.symbol,
              event_type: 'POSITION_UPDATE',
              side: position.side,
              entry_price: position.entry_price,
              exit_price: null,
              current_price: position.current_price || position.entry_price,
              quantity: null,
              position_size: position.size,
              unrealized_pnl: position.unrealized_pnl || 0,
              realized_pnl: null,
              fees: null,
              leverage: position.leverage || 1,
              status: position.status,
              reason: null,
              rejection_reason: null,
              executed: null,
              market_value: position.market_value || null,
              cost_basis: position.cost_basis || null,
              run_capital: run.current_capital,
              open_positions_count: null,
              notes: `Position ${position.position_id.substring(0, 8)}`,
            });
          }
          
          // Add OHLCV candles
          for (const candle of candles) {
            const candleMinute = getMinuteKey(candle.ts);
            if (!timeline[candleMinute]) timeline[candleMinute] = [];
            timeline[candleMinute].push({
              timestamp: candle.ts,
              symbol: candle.symbol,
              event_type: 'MARKET_DATA',
              side: null,
              entry_price: null,
              exit_price: null,
              current_price: Number(candle.close),
              quantity: null,
              position_size: null,
              unrealized_pnl: null,
              realized_pnl: null,
              fees: null,
              leverage: null,
              status: null,
              reason: null,
              rejection_reason: null,
              executed: null,
              market_value: null,
              cost_basis: null,
              run_capital: null,
              open_positions_count: null,
              notes: `OHLCV: O=${Number(candle.open).toFixed(4)} H=${Number(candle.high).toFixed(4)} L=${Number(candle.low).toFixed(4)} C=${Number(candle.close).toFixed(4)} V=${Number(candle.volume).toFixed(2)}`,
            });
          }
          
          // Convert to sorted array
          const allMinutes = Object.keys(timeline).sort();
          const rows: TradeRow[] = [];
          for (const minute of allMinutes) {
            const events = timeline[minute];
            for (const event of events) {
              rows.push(event);
            }
          }
          
          // Generate CSV
          const csvHeaders = [
            'timestamp', 'symbol', 'event_type', 'side', 'entry_price', 'exit_price', 'current_price',
            'quantity', 'position_size', 'unrealized_pnl', 'realized_pnl', 'fees', 'leverage',
            'status', 'reason', 'rejection_reason', 'executed', 'market_value', 'cost_basis',
            'run_capital', 'open_positions_count', 'notes'
          ];
          
          let csv = csvHeaders.join(',') + '\n';
          for (const row of rows) {
            const csvRow = [
              row.timestamp,
              row.symbol,
              row.event_type,
              row.side || '',
              row.entry_price?.toFixed(8) || '',
              row.exit_price?.toFixed(8) || '',
              row.current_price?.toFixed(8) || '',
              row.quantity?.toFixed(8) || '',
              row.position_size?.toFixed(8) || '',
              row.unrealized_pnl?.toFixed(8) || '',
              row.realized_pnl?.toFixed(8) || '',
              row.fees?.toFixed(8) || '',
              row.leverage?.toFixed(2) || '',
              row.status || '',
              row.reason || '',
              row.rejection_reason || '',
              row.executed === null ? '' : row.executed.toString(),
              row.market_value?.toFixed(8) || '',
              row.cost_basis?.toFixed(8) || '',
              row.run_capital?.toFixed(8) || '',
              row.open_positions_count?.toString() || '',
              `"${(row.notes || '').replace(/"/g, '""')}"`,
            ];
            csv += csvRow.join(',') + '\n';
          }
          
          const filename = `trade-${TRADE_ID.substring(0, 8)}-${new Date().toISOString().substring(0, 10)}.csv`;
          const filepath = path.join(process.cwd(), filename);
          fs.writeFileSync(filepath, csv);
          
          console.log(`\n✅ Exported ${rows.length} rows (${trades.length} trades, ${candles.length} candles) to: ${filename}`);
          console.log(`📊 Time range: ${allMinutes[0]} to ${allMinutes[allMinutes.length - 1]}`);
          await pool.end();
          return;
        }
      }
    } catch (apiError: any) {
      console.error(`API fetch failed: ${apiError.message}`);
    }
    
    console.error(`❌ No trade or run found with ID: ${TRADE_ID}`);
    console.error(`\n💡 Suggestions:`);
    console.error(`   - Make sure you're using the correct ID format`);
    console.error(`   - The ID might be from a different system`);
    console.error(`   - Try searching for runs with multiple positions:`);
    
    // Show runs with multiple positions as suggestions
    const multiPos = await pool.query(`
      SELECT 
        t.run_id,
        t.symbol,
        COUNT(*) as position_count,
        STRING_AGG(DISTINCT t.side, ', ') as sides,
        MIN(t.entry_ts) as first_entry,
        r.name as run_name
      FROM ft_trades t
      JOIN ft_runs r ON t.run_id = r.run_id
      WHERE t.status = 'open'
      GROUP BY t.run_id, t.symbol, r.name
      HAVING COUNT(*) > 1
      ORDER BY first_entry DESC
      LIMIT 5
    `);
    
    if (multiPos.rows.length > 0) {
      console.error(`\n   Recent runs with multiple positions:`);
      multiPos.rows.forEach(r => {
        console.error(`     Run: ${r.run_id} (${r.run_name || 'Unnamed'})`);
        console.error(`       Symbol: ${r.symbol}, Positions: ${r.position_count} (${r.sides})`);
      });
    }
    
    await pool.end();
    process.exit(1);
  }

  console.log(`📊 Run: ${runName}`);
  console.log(`🔍 Gathering minute-by-minute data...\n`);

  // Get run info
  const runInfo = await pool.query('SELECT * FROM ft_runs WHERE run_id = $1', [runId]);
  if (runInfo.rows.length === 0) {
    console.error(`❌ Run not found: ${runId}`);
    process.exit(1);
  }
  const run = runInfo.rows[0];

  // Get all trades for this run (or specific trade if tradeId provided)
  const tradesQuery = tradeId
    ? 'SELECT * FROM ft_trades WHERE trade_id = $1 ORDER BY entry_ts'
    : 'SELECT * FROM ft_trades WHERE run_id = $1 ORDER BY entry_ts';
  const tradesResult = await pool.query(tradesQuery, tradeId ? [tradeId] : [runId]);
  const trades = tradesResult.rows;

  if (trades.length === 0) {
    console.error(`❌ No trades found for ${tradeId ? 'trade' : 'run'}: ${TRADE_ID}`);
    process.exit(1);
  }

  console.log(`✓ Found ${trades.length} trade(s)`);

  // Get all symbols involved
  const symbols = [...new Set(trades.map((t: any) => t.symbol))];
  console.log(`✓ Symbols: ${symbols.join(', ')}`);

  // Get all positions (historical - we'll track when they were created/updated)
  const positionsQuery = `
    SELECT p.*, t.trade_id
    FROM ft_positions p
    LEFT JOIN ft_trades t ON t.run_id = p.run_id AND t.symbol = p.symbol AND t.side = p.side
    WHERE p.run_id = $1
    ORDER BY p.opened_at, p.last_update
  `;
  const positionsResult = await pool.query(positionsQuery, [runId]);
  const positions = positionsResult.rows;
  console.log(`✓ Found ${positions.length} position(s)`);

  // Get all signals for this run
  const signalsQuery = `
    SELECT * FROM ft_signals 
    WHERE run_id = $1 AND symbol = ANY($2)
    ORDER BY signal_ts
  `;
  const signalsResult = await pool.query(signalsQuery, [runId, symbols]);
  const signals = signalsResult.rows;
  console.log(`✓ Found ${signals.length} signal(s)`);

  // Get OHLCV data for the symbols - get 1-minute candles for the timeframe
  const firstTrade = trades[0];
  const lastTrade = trades[trades.length - 1];
  const startTime = firstTrade.entry_ts;
  const endTime = lastTrade.exit_ts || lastTrade.entry_ts;

  // Extend time range a bit to get context
  const startTimeDate = new Date(startTime);
  startTimeDate.setHours(startTimeDate.getHours() - 1); // 1 hour before
  const endTimeDate = new Date(endTime);
  endTimeDate.setHours(endTimeDate.getHours() + 1); // 1 hour after

  const ohlcvQuery = `
    SELECT symbol, ts, open, high, low, close, volume
    FROM ohlcv_1m
    WHERE symbol = ANY($1)
      AND ts >= $2
      AND ts <= $3
    ORDER BY ts, symbol
  `;
  const ohlcvResult = await pool.query(ohlcvQuery, [symbols, startTimeDate.toISOString(), endTimeDate.toISOString()]);
  const candles = ohlcvResult.rows;
  console.log(`✓ Found ${candles.length} minute candles`);

  // Build minute-by-minute timeline
  const timeline: Record<string, TradeRow[]> = {}; // key: minute timestamp (ISO string truncated to minute)

  // Helper to get minute key
  const getMinuteKey = (ts: string | Date): string => {
    const d = typeof ts === 'string' ? new Date(ts) : ts;
    return d.toISOString().substring(0, 16) + ':00.000Z'; // Round to minute
  };

  // Add trade entries
  for (const trade of trades) {
    const minuteKey = getMinuteKey(trade.entry_ts);
    if (!timeline[minuteKey]) timeline[minuteKey] = [];

    timeline[minuteKey].push({
      timestamp: trade.entry_ts,
      symbol: trade.symbol,
      event_type: 'TRADE_ENTRY',
      side: trade.side,
      entry_price: Number(trade.entry_px),
      exit_price: null,
      current_price: Number(trade.entry_px),
      quantity: Number(trade.qty),
      position_size: Number(trade.qty),
      unrealized_pnl: Number(trade.unrealized_pnl || 0),
      realized_pnl: Number(trade.realized_pnl || 0),
      fees: Number(trade.fees || 0),
      leverage: Number(trade.leverage || 1),
      status: trade.status,
      reason: trade.reason || null,
      rejection_reason: null,
      executed: true,
      market_value: null,
      cost_basis: null,
      run_capital: null,
      open_positions_count: null,
      notes: `Trade ${trade.trade_id.substring(0, 8)} opened`,
    });
  }

  // Add trade exits
  for (const trade of trades) {
    if (trade.exit_ts) {
      const minuteKey = getMinuteKey(trade.exit_ts);
      if (!timeline[minuteKey]) timeline[minuteKey] = [];

      timeline[minuteKey].push({
        timestamp: trade.exit_ts,
        symbol: trade.symbol,
        event_type: 'TRADE_EXIT',
        side: trade.side,
        entry_price: Number(trade.entry_px),
        exit_price: Number(trade.exit_px || trade.entry_px),
        current_price: Number(trade.exit_px || trade.entry_px),
        quantity: Number(trade.qty),
        position_size: null,
        unrealized_pnl: null,
        realized_pnl: Number(trade.realized_pnl || 0),
        fees: Number(trade.fees || 0),
        leverage: Number(trade.leverage || 1),
        status: trade.status,
        reason: trade.reason || null,
        rejection_reason: null,
        executed: true,
        market_value: null,
        cost_basis: null,
        run_capital: null,
        open_positions_count: null,
        notes: `Trade ${trade.trade_id.substring(0, 8)} closed`,
      });
    }
  }

  // Add position updates (if available)
  for (const position of positions) {
    const minuteKey = getMinuteKey(position.last_update);
    if (!timeline[minuteKey]) timeline[minuteKey] = [];

    timeline[minuteKey].push({
      timestamp: position.last_update,
      symbol: position.symbol,
      event_type: 'POSITION_UPDATE',
      side: position.side,
      entry_price: Number(position.entry_price),
      exit_price: null,
      current_price: Number(position.current_price || position.entry_price),
      quantity: null,
      position_size: Number(position.size),
      unrealized_pnl: Number(position.unrealized_pnl || 0),
      realized_pnl: null,
      fees: null,
      leverage: Number(position.leverage || 1),
      status: position.status,
      reason: null,
      rejection_reason: null,
      executed: null,
      market_value: Number(position.market_value || 0),
      cost_basis: Number(position.cost_basis || 0),
      run_capital: null,
      open_positions_count: null,
      notes: `Position ${position.position_id.substring(0, 8)}`,
    });
  }

  // Add signals
  for (const signal of signals) {
    const minuteKey = getMinuteKey(signal.signal_ts);
    if (!timeline[minuteKey]) timeline[minuteKey] = [];

    timeline[minuteKey].push({
      timestamp: signal.signal_ts,
      symbol: signal.symbol,
      event_type: signal.executed ? 'SIGNAL_EXECUTED' : 'SIGNAL_REJECTED',
      side: signal.side,
      entry_price: signal.execution_price ? Number(signal.execution_price) : (signal.price ? Number(signal.price) : null),
      exit_price: null,
      current_price: signal.price ? Number(signal.price) : null,
      quantity: signal.size ? Number(signal.size) : null,
      position_size: signal.size ? Number(signal.size) : null,
      unrealized_pnl: null,
      realized_pnl: null,
      fees: null,
      leverage: null,
      status: null,
      reason: null,
      rejection_reason: signal.rejection_reason || null,
      executed: signal.executed,
      market_value: null,
      cost_basis: null,
      run_capital: null,
      open_positions_count: null,
      notes: `${signal.signal_type} signal ${signal.executed ? 'executed' : 'rejected'}`,
    });
  }

  // Add OHLCV candles (group by minute)
  for (const candle of candles) {
    const minuteKey = getMinuteKey(candle.ts);
    if (!timeline[minuteKey]) timeline[minuteKey] = [];

    timeline[minuteKey].push({
      timestamp: candle.ts,
      symbol: candle.symbol,
      event_type: 'MARKET_DATA',
      side: null,
      entry_price: null,
      exit_price: null,
      current_price: Number(candle.close),
      quantity: null,
      position_size: null,
      unrealized_pnl: null,
      realized_pnl: null,
      fees: null,
      leverage: null,
      status: null,
      reason: null,
      rejection_reason: null,
      executed: null,
      market_value: null,
      cost_basis: null,
      run_capital: null,
      open_positions_count: null,
      notes: `OHLCV: O=${Number(candle.open).toFixed(4)} H=${Number(candle.high).toFixed(4)} L=${Number(candle.low).toFixed(4)} C=${Number(candle.close).toFixed(4)} V=${Number(candle.volume).toFixed(2)}`,
    });
  }

  // Convert timeline to sorted array
  const allMinutes = Object.keys(timeline).sort();
  const rows: TradeRow[] = [];

  for (const minute of allMinutes) {
    const events = timeline[minute];
    for (const event of events) {
      rows.push(event);
    }
  }

  // Add run capital info where possible (from run table)
  const runCapital = Number(run.current_capital || run.starting_capital);

  // Generate CSV
  const csvHeaders = [
    'timestamp',
    'symbol',
    'event_type',
    'side',
    'entry_price',
    'exit_price',
    'current_price',
    'quantity',
    'position_size',
    'unrealized_pnl',
    'realized_pnl',
    'fees',
    'leverage',
    'status',
    'reason',
    'rejection_reason',
    'executed',
    'market_value',
    'cost_basis',
    'run_capital',
    'open_positions_count',
    'notes',
  ];

  let csv = csvHeaders.join(',') + '\n';

  for (const row of rows) {
    const csvRow = [
      row.timestamp,
      row.symbol,
      row.event_type,
      row.side || '',
      row.entry_price?.toFixed(8) || '',
      row.exit_price?.toFixed(8) || '',
      row.current_price?.toFixed(8) || '',
      row.quantity?.toFixed(8) || '',
      row.position_size?.toFixed(8) || '',
      row.unrealized_pnl?.toFixed(8) || '',
      row.realized_pnl?.toFixed(8) || '',
      row.fees?.toFixed(8) || '',
      row.leverage?.toFixed(2) || '',
      row.status || '',
      row.reason || '',
      row.rejection_reason || '',
      row.executed === null ? '' : row.executed.toString(),
      row.market_value?.toFixed(8) || '',
      row.cost_basis?.toFixed(8) || '',
      row.run_capital?.toFixed(8) || '',
      row.open_positions_count?.toString() || '',
      `"${(row.notes || '').replace(/"/g, '""')}"`,
    ];
    csv += csvRow.join(',') + '\n';
  }

  // Write to file
  const filename = `trade-${TRADE_ID.substring(0, 8)}-${new Date().toISOString().substring(0, 10)}.csv`;
  const filepath = path.join(process.cwd(), filename);
  fs.writeFileSync(filepath, csv);

  console.log(`\n✅ Exported ${rows.length} rows to: ${filename}`);
  console.log(`📊 Time range: ${allMinutes[0]} to ${allMinutes[allMinutes.length - 1]}`);
  console.log(`📈 Events: ${rows.filter(r => r.event_type === 'TRADE_ENTRY').length} entries, ${rows.filter(r => r.event_type === 'TRADE_EXIT').length} exits`);

  await pool.end();
}

exportTradeData().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});


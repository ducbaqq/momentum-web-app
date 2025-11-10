import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function getDbUrl(dbName: 'dev' | 'staging'): string {
  if (process.env.DB_BASE_URL) {
    return `${process.env.DB_BASE_URL}/${dbName}`;
  }
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
    const match = baseUrl.match(/\/([^/?]+)(\?|$)/);
    if (match) {
      return baseUrl.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
    }
  }
  throw new Error(`Cannot determine database URL for ${dbName}`);
}

function createPool(dbName: 'dev' | 'staging'): Pool {
  const url = getDbUrl(dbName);
  const isDigitalOcean = url.includes('ondigitalocean') || url.includes('ssl') || url.includes('sslmode=require');
  return new Pool({
    connectionString: url,
    ssl: isDigitalOcean ? { rejectUnauthorized: false } : false,
    max: 3,
  });
}

async function compareRuns() {
  const stagingPool = createPool('staging');
  const devPool = createPool('dev');
  
  try {
    const stagingRunId = '02fac408-45b9-4768-95ce-2cfc2485233c';
    const devRunId = '064d2905-bc80-46b4-b836-a64499817ffe';
    
    console.log('🔍 Comparing runs:\n');
    console.log(`Staging: ${stagingRunId}`);
    console.log(`Dev: ${devRunId}\n`);
    
    // Get staging run
    const stagingRunQuery = `
      SELECT 
        run_id,
        name,
        symbols,
        timeframe,
        strategy_name,
        strategy_version,
        params,
        status,
        starting_capital,
        current_capital,
        max_concurrent_positions,
        created_at,
        started_at,
        last_update,
        stopped_at,
        error
      FROM ft_runs
      WHERE run_id = $1
    `;
    
    const stagingResult = await stagingPool.query(stagingRunQuery, [stagingRunId]);
    const stagingRun = stagingResult.rows[0];
    
    if (!stagingRun) {
      console.log('❌ Staging run not found!');
      return;
    }
    
    // Get dev run
    const devResult = await devPool.query(stagingRunQuery, [devRunId]);
    const devRun = devResult.rows[0];
    
    if (!devRun) {
      console.log('❌ Dev run not found!');
      return;
    }
    
    console.log('📊 STAGING RUN:');
    console.log(`  Name: ${stagingRun.name}`);
    console.log(`  Status: ${stagingRun.status}`);
    console.log(`  Symbols: ${JSON.stringify(stagingRun.symbols)}`);
    console.log(`  Timeframe: ${stagingRun.timeframe}`);
    console.log(`  Strategy: ${stagingRun.strategy_name} v${stagingRun.strategy_version}`);
    console.log(`  Params: ${JSON.stringify(stagingRun.params, null, 2)}`);
    console.log(`  Created: ${stagingRun.created_at}`);
    console.log(`  Started: ${stagingRun.started_at || 'N/A'}`);
    console.log(`  Last Update: ${stagingRun.last_update || 'N/A'}`);
    console.log(`  Stopped: ${stagingRun.stopped_at || 'N/A'}`);
    console.log(`  Error: ${stagingRun.error || 'N/A'}`);
    console.log(`  Capital: $${Number(stagingRun.starting_capital).toFixed(2)} → $${Number(stagingRun.current_capital).toFixed(2)}`);
    console.log(`  Max Positions: ${stagingRun.max_concurrent_positions}`);
    
    console.log('\n📊 DEV RUN:');
    console.log(`  Name: ${devRun.name}`);
    console.log(`  Status: ${devRun.status}`);
    console.log(`  Symbols: ${JSON.stringify(devRun.symbols)}`);
    console.log(`  Timeframe: ${devRun.timeframe}`);
    console.log(`  Strategy: ${devRun.strategy_name} v${devRun.strategy_version}`);
    console.log(`  Params: ${JSON.stringify(devRun.params, null, 2)}`);
    console.log(`  Created: ${devRun.created_at}`);
    console.log(`  Started: ${devRun.started_at || 'N/A'}`);
    console.log(`  Last Update: ${devRun.last_update || 'N/A'}`);
    console.log(`  Stopped: ${devRun.stopped_at || 'N/A'}`);
    console.log(`  Error: ${devRun.error || 'N/A'}`);
    console.log(`  Capital: $${Number(devRun.starting_capital).toFixed(2)} → $${Number(devRun.current_capital).toFixed(2)}`);
    console.log(`  Max Positions: ${devRun.max_concurrent_positions}`);
    
    // Get trades for staging
    const stagingTradesQuery = `
      SELECT 
        trade_id,
        symbol,
        side,
        entry_ts,
        exit_ts,
        qty,
        entry_px,
        exit_px,
        realized_pnl,
        status
      FROM ft_trades
      WHERE run_id = $1
      ORDER BY entry_ts ASC
    `;
    
    const stagingTradesResult = await stagingPool.query(stagingTradesQuery, [stagingRunId]);
    console.log(`\n📈 STAGING TRADES: ${stagingTradesResult.rows.length}`);
    stagingTradesResult.rows.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} ${trade.side} @ $${Number(trade.entry_px).toFixed(2)} → ${trade.exit_px ? `$${Number(trade.exit_px).toFixed(2)}` : 'OPEN'} (P&L: $${Number(trade.realized_pnl).toFixed(2)})`);
      console.log(`     Entry: ${trade.entry_ts}, Exit: ${trade.exit_ts || 'OPEN'}`);
    });
    
    // Get trades for dev
    const devTradesResult = await devPool.query(stagingTradesQuery, [devRunId]);
    console.log(`\n📈 DEV TRADES: ${devTradesResult.rows.length}`);
    devTradesResult.rows.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} ${trade.side} @ $${Number(trade.entry_px).toFixed(2)} → ${trade.exit_px ? `$${Number(trade.exit_px).toFixed(2)}` : 'OPEN'} (P&L: $${Number(trade.realized_pnl).toFixed(2)})`);
      console.log(`     Entry: ${trade.entry_ts}, Exit: ${trade.exit_ts || 'OPEN'}`);
    });
    
    // Get signals for staging
    const stagingSignalsQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_type,
        side,
        signal_ts,
        executed,
        rejection_reason,
        execution_notes
      FROM ft_signals
      WHERE run_id = $1
      ORDER BY signal_ts ASC
      LIMIT 50
    `;
    
    const stagingSignalsResult = await stagingPool.query(stagingSignalsQuery, [stagingRunId]);
    console.log(`\n📡 STAGING SIGNALS: ${stagingSignalsResult.rows.length} (showing first 50)`);
    const stagingExecuted = stagingSignalsResult.rows.filter(s => s.executed).length;
    const stagingRejected = stagingSignalsResult.rows.filter(s => !s.executed && s.rejection_reason).length;
    console.log(`  Executed: ${stagingExecuted}, Rejected: ${stagingRejected}, Other: ${stagingSignalsResult.rows.length - stagingExecuted - stagingRejected}`);
    
    if (stagingSignalsResult.rows.length > 0) {
      console.log('  First 10 signals:');
      stagingSignalsResult.rows.slice(0, 10).forEach((signal, i) => {
        console.log(`    ${i + 1}. ${signal.signal_ts} - ${signal.signal_type} ${signal.side || 'N/A'} - Executed: ${signal.executed}`);
        if (signal.rejection_reason) {
          console.log(`       Rejection: ${signal.rejection_reason}`);
        }
      });
    }
    
    // Get signals for dev
    const devSignalsResult = await devPool.query(stagingSignalsQuery, [devRunId]);
    console.log(`\n📡 DEV SIGNALS: ${devSignalsResult.rows.length} (showing first 50)`);
    const devExecuted = devSignalsResult.rows.filter(s => s.executed).length;
    const devRejected = devSignalsResult.rows.filter(s => !s.executed && s.rejection_reason).length;
    console.log(`  Executed: ${devExecuted}, Rejected: ${devRejected}, Other: ${devSignalsResult.rows.length - devExecuted - devRejected}`);
    
    if (devSignalsResult.rows.length > 0) {
      console.log('  First 10 signals:');
      devSignalsResult.rows.slice(0, 10).forEach((signal, i) => {
        console.log(`    ${i + 1}. ${signal.signal_ts} - ${signal.signal_type} ${signal.side || 'N/A'} - Executed: ${signal.executed}`);
        if (signal.rejection_reason) {
          console.log(`       Rejection: ${signal.rejection_reason}`);
        }
      });
    }
    
    // Check last processed candles
    const stagingCandlesQuery = `
      SELECT 
        symbol,
        last_processed_candle,
        updated_at
      FROM ft_last_processed_candles
      WHERE run_id = $1
      ORDER BY symbol
    `;
    
    const stagingCandlesResult = await stagingPool.query(stagingCandlesQuery, [stagingRunId]);
    console.log(`\n🕐 STAGING LAST PROCESSED CANDLES: ${stagingCandlesResult.rows.length}`);
    stagingCandlesResult.rows.forEach(row => {
      console.log(`  ${row.symbol}: ${row.last_processed_candle} (updated: ${row.updated_at})`);
    });
    
    const devCandlesResult = await devPool.query(stagingCandlesQuery, [devRunId]);
    console.log(`\n🕐 DEV LAST PROCESSED CANDLES: ${devCandlesResult.rows.length}`);
    devCandlesResult.rows.forEach(row => {
      console.log(`  ${row.symbol}: ${row.last_processed_candle} (updated: ${row.updated_at})`);
    });
    
    // Check positions
    const stagingPositionsQuery = `
      SELECT 
        position_id,
        symbol,
        side,
        entry_price,
        status,
        opened_at
      FROM ft_positions
      WHERE run_id = $1
      ORDER BY opened_at ASC
    `;
    
    const stagingPositionsResult = await stagingPool.query(stagingPositionsQuery, [stagingRunId]);
    console.log(`\n📍 STAGING POSITIONS: ${stagingPositionsResult.rows.length}`);
    stagingPositionsResult.rows.forEach((pos, i) => {
      console.log(`  ${i + 1}. ${pos.symbol} ${pos.side} @ $${Number(pos.entry_price).toFixed(2)} - ${pos.status} (opened: ${pos.opened_at})`);
    });
    
    const devPositionsResult = await devPool.query(stagingPositionsQuery, [devRunId]);
    console.log(`\n📍 DEV POSITIONS: ${devPositionsResult.rows.length}`);
    devPositionsResult.rows.forEach((pos, i) => {
      console.log(`  ${i + 1}. ${pos.symbol} ${pos.side} @ $${Number(pos.entry_price).toFixed(2)} - ${pos.status} (opened: ${pos.opened_at})`);
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await stagingPool.end();
    await devPool.end();
  }
}

compareRuns().catch(console.error);


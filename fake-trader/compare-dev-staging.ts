import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Compare latest fake trader runs between dev and staging
 * to diagnose why dev isn't making trades
 */

function getDbUrl(dbName: 'dev' | 'staging'): string {
  // PRIMARY: Use DB_BASE_URL + TRADING_DB_NAME
  if (process.env.DB_BASE_URL) {
    return `${process.env.DB_BASE_URL}/${dbName}`;
  }
  
  // FALLBACK: Use DATABASE_URL and replace database name
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
    const match = baseUrl.match(/\/([^/?]+)(\?|$)/);
    if (match) {
      return baseUrl.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
    }
  }
  
  throw new Error(`Cannot determine database URL for ${dbName}. Set DB_BASE_URL or DATABASE_URL`);
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
  const devPool = createPool('dev');
  const stagingPool = createPool('staging');
  
  try {
    console.log('🔍 Comparing latest fake trader runs between dev and staging...\n');
    
    // Get latest 3 runs from each environment to find the most recent one
    const devRunsQuery = `
      SELECT 
        run_id, name, symbols, strategy_name, strategy_version, params,
        status, starting_capital, current_capital, max_concurrent_positions,
        created_at, started_at, last_update, error
      FROM ft_runs
      ORDER BY created_at DESC
      LIMIT 3
    `;
    
    const stagingRunsQuery = devRunsQuery;
    
    const [devRunsResult, stagingRunsResult] = await Promise.all([
      devPool.query(devRunsQuery),
      stagingPool.query(stagingRunsQuery)
    ]);
    
    if (devRunsResult.rows.length === 0) {
      console.log('❌ No runs found in dev database');
      return;
    }
    
    if (stagingRunsResult.rows.length === 0) {
      console.log('❌ No runs found in staging database');
      return;
    }
    
    console.log(`\n📋 Found ${devRunsResult.rows.length} recent runs in dev, ${stagingRunsResult.rows.length} in staging`);
    console.log('\nRecent runs in DEV:');
    devRunsResult.rows.forEach((run: any, i: number) => {
      console.log(`  ${i + 1}. ${run.name || 'Unnamed'} - ${run.status} - Created: ${run.created_at} - Trades: (checking...)`);
    });
    console.log('\nRecent runs in STAGING:');
    stagingRunsResult.rows.forEach((run: any, i: number) => {
      console.log(`  ${i + 1}. ${run.name || 'Unnamed'} - ${run.status} - Created: ${run.created_at} - Trades: (checking...)`);
    });
    
    // Check trade counts for all recent runs first
    console.log('\n📊 Trade counts for recent runs:');
    for (const run of devRunsResult.rows) {
      const tradeCountResult = await devPool.query(
        'SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1',
        [run.run_id]
      );
      console.log(`  DEV: ${run.name || 'Unnamed'} - ${tradeCountResult.rows[0].count} trades`);
    }
    for (const run of stagingRunsResult.rows) {
      const tradeCountResult = await stagingPool.query(
        'SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1',
        [run.run_id]
      );
      console.log(`  STAGING: ${run.name || 'Unnamed'} - ${tradeCountResult.rows[0].count} trades`);
    }
    
    // Find runs with 0 trades (the "new" runs the user mentioned)
    const devRunWithNoTrades = devRunsResult.rows.find(async (r: any) => {
      const result = await devPool.query('SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1', [r.run_id]);
      return result.rows[0].count === '0';
    });
    
    // Use the most recent run, or find one with matching name
    const devRun = devRunsResult.rows[0]; // Most recent
    const stagingRun = stagingRunsResult.rows[0]; // Most recent
    
    console.log(`\n🔍 Comparing MOST RECENT runs:`);
    console.log(`  DEV: ${devRun.name || 'Unnamed'} (${devRun.run_id.substring(0, 8)}...) - Status: ${devRun.status}`);
    console.log(`  STAGING: ${stagingRun.name || 'Unnamed'} (${stagingRun.run_id.substring(0, 8)}...) - Status: ${stagingRun.status}`);
    
    console.log('📊 LATEST RUNS:');
    console.log('\n=== DEV ===');
    console.log(`Run ID: ${devRun.run_id}`);
    console.log(`Name: ${devRun.name || 'Unnamed'}`);
    console.log(`Status: ${devRun.status}`);
    console.log(`Symbols: ${devRun.symbols?.join(', ') || 'N/A'}`);
    console.log(`Strategy: ${devRun.strategy_name} v${devRun.strategy_version}`);
    console.log(`Params: ${JSON.stringify(devRun.params, null, 2)}`);
    console.log(`Capital: $${devRun.current_capital} / $${devRun.starting_capital}`);
    console.log(`Max Positions: ${devRun.max_concurrent_positions}`);
    console.log(`Created: ${devRun.created_at}`);
    console.log(`Started: ${devRun.started_at || 'N/A'}`);
    console.log(`Last Update: ${devRun.last_update || 'N/A'}`);
    if (devRun.error) {
      console.log(`❌ Error: ${devRun.error}`);
    }
    
    console.log('\n=== STAGING ===');
    console.log(`Run ID: ${stagingRun.run_id}`);
    console.log(`Name: ${stagingRun.name || 'Unnamed'}`);
    console.log(`Status: ${stagingRun.status}`);
    console.log(`Symbols: ${stagingRun.symbols?.join(', ') || 'N/A'}`);
    console.log(`Strategy: ${stagingRun.strategy_name} v${stagingRun.strategy_version}`);
    console.log(`Params: ${JSON.stringify(stagingRun.params, null, 2)}`);
    console.log(`Capital: $${stagingRun.current_capital} / $${stagingRun.starting_capital}`);
    console.log(`Max Positions: ${stagingRun.max_concurrent_positions}`);
    console.log(`Created: ${stagingRun.created_at}`);
    console.log(`Started: ${stagingRun.started_at || 'N/A'}`);
    console.log(`Last Update: ${stagingRun.last_update || 'N/A'}`);
    if (stagingRun.error) {
      console.log(`❌ Error: ${stagingRun.error}`);
    }
    
    // Compare configurations
    console.log('\n\n🔍 CONFIGURATION COMPARISON:');
    const configMatch = 
      devRun.symbols?.join(',') === stagingRun.symbols?.join(',') &&
      devRun.strategy_name === stagingRun.strategy_name &&
      devRun.strategy_version === stagingRun.strategy_version &&
      JSON.stringify(devRun.params) === JSON.stringify(stagingRun.params) &&
      devRun.max_concurrent_positions === stagingRun.max_concurrent_positions;
    
    if (configMatch) {
      console.log('✅ Configurations match');
    } else {
      console.log('⚠️  Configurations differ:');
      if (devRun.symbols?.join(',') !== stagingRun.symbols?.join(',')) {
        console.log(`  - Symbols: dev=[${devRun.symbols?.join(',')}] vs staging=[${stagingRun.symbols?.join(',')}]`);
      }
      if (devRun.strategy_name !== stagingRun.strategy_name) {
        console.log(`  - Strategy: dev=${devRun.strategy_name} vs staging=${stagingRun.strategy_name}`);
      }
      if (JSON.stringify(devRun.params) !== JSON.stringify(stagingRun.params)) {
        console.log(`  - Params: dev=${JSON.stringify(devRun.params)} vs staging=${JSON.stringify(stagingRun.params)}`);
      }
    }
    
    // Check trades
    console.log('\n\n📈 TRADES COMPARISON:');
    const devTradesQuery = `
      SELECT COUNT(*) as total_trades,
             COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_trades,
             COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_trades,
             MIN(entry_ts) as first_trade,
             MAX(entry_ts) as last_trade
      FROM ft_trades
      WHERE run_id = $1
    `;
    
    const [devTradesResult, stagingTradesResult] = await Promise.all([
      devPool.query(devTradesQuery, [devRun.run_id]),
      stagingPool.query(devTradesQuery, [stagingRun.run_id])
    ]);
    
    const devTrades = devTradesResult.rows[0];
    const stagingTrades = stagingTradesResult.rows[0];
    
    console.log('\n=== DEV ===');
    console.log(`Total Trades: ${devTrades.total_trades}`);
    console.log(`Closed: ${devTrades.closed_trades}, Open: ${devTrades.open_trades}`);
    console.log(`First Trade: ${devTrades.first_trade || 'N/A'}`);
    console.log(`Last Trade: ${devTrades.last_trade || 'N/A'}`);
    
    console.log('\n=== STAGING ===');
    console.log(`Total Trades: ${stagingTrades.total_trades}`);
    console.log(`Closed: ${stagingTrades.closed_trades}, Open: ${stagingTrades.open_trades}`);
    console.log(`First Trade: ${stagingTrades.first_trade || 'N/A'}`);
    console.log(`Last Trade: ${stagingTrades.last_trade || 'N/A'}`);
    
    // Check signals
    console.log('\n\n📡 SIGNALS COMPARISON:');
    const devSignalsQuery = `
      SELECT 
        COUNT(*) as total_signals,
        COUNT(CASE WHEN executed = true THEN 1 END) as executed_signals,
        COUNT(CASE WHEN executed = false THEN 1 END) as rejected_signals,
        COUNT(DISTINCT symbol) as symbols_with_signals,
        MIN(signal_ts) as first_signal,
        MAX(signal_ts) as last_signal
      FROM ft_signals
      WHERE run_id = $1
    `;
    
    const [devSignalsResult, stagingSignalsResult] = await Promise.all([
      devPool.query(devSignalsQuery, [devRun.run_id]),
      stagingPool.query(devSignalsQuery, [stagingRun.run_id])
    ]);
    
    const devSignals = devSignalsResult.rows[0];
    const stagingSignals = stagingSignalsResult.rows[0];
    
    console.log('\n=== DEV ===');
    console.log(`Total Signals: ${devSignals.total_signals}`);
    console.log(`Executed: ${devSignals.executed_signals}, Rejected: ${devSignals.rejected_signals}`);
    console.log(`Symbols with Signals: ${devSignals.symbols_with_signals}`);
    console.log(`First Signal: ${devSignals.first_signal || 'N/A'}`);
    console.log(`Last Signal: ${devSignals.last_signal || 'N/A'}`);
    
    console.log('\n=== STAGING ===');
    console.log(`Total Signals: ${stagingSignals.total_signals}`);
    console.log(`Executed: ${stagingSignals.executed_signals}, Rejected: ${stagingSignals.rejected_signals}`);
    console.log(`Symbols with Signals: ${stagingSignals.symbols_with_signals}`);
    console.log(`First Signal: ${stagingSignals.first_signal || 'N/A'}`);
    console.log(`Last Signal: ${stagingSignals.last_signal || 'N/A'}`);
    
    // Check rejection reasons in dev
    if (devSignals.rejected_signals > 0) {
      console.log('\n\n🚫 DEV REJECTION REASONS:');
      const rejectionReasonsQuery = `
        SELECT rejection_reason, COUNT(*) as count
        FROM ft_signals
        WHERE run_id = $1 AND executed = false AND rejection_reason IS NOT NULL
        GROUP BY rejection_reason
        ORDER BY count DESC
      `;
      const rejectionResult = await devPool.query(rejectionReasonsQuery, [devRun.run_id]);
      rejectionResult.rows.forEach((row: any) => {
        console.log(`  ${row.rejection_reason}: ${row.count} signals`);
      });
    }
    
    // Check last processed candles (stored in ft_runs table, not per symbol!)
    console.log('\n\n🕐 LAST PROCESSED CANDLES:');
    const lastCandleQuery = `
      SELECT last_processed_candle
      FROM ft_runs
      WHERE run_id = $1
    `;
    
    const [devCandlesResult, stagingCandlesResult] = await Promise.all([
      devPool.query(lastCandleQuery, [devRun.run_id]),
      stagingPool.query(lastCandleQuery, [stagingRun.run_id])
    ]);
    
    console.log('\n=== DEV ===');
    const devLastCandle = devCandlesResult.rows[0]?.last_processed_candle;
    if (!devLastCandle) {
      console.log('⚠️  No last_processed_candle found (run may not have processed any candles yet)');
    } else {
      console.log(`  Last Processed Candle: ${devLastCandle}`);
      console.log(`  ⚠️  NOTE: This is tracked per-run, not per-symbol! This may cause issues with multi-symbol runs.`);
    }
    
    console.log('\n=== STAGING ===');
    const stagingLastCandle = stagingCandlesResult.rows[0]?.last_processed_candle;
    if (!stagingLastCandle) {
      console.log('⚠️  No last_processed_candle found (run may not have processed any candles yet)');
    } else {
      console.log(`  Last Processed Candle: ${stagingLastCandle}`);
      console.log(`  ⚠️  NOTE: This is tracked per-run, not per-symbol! This may cause issues with multi-symbol runs.`);
    }
    
    // Check positions
    console.log('\n\n📍 POSITIONS:');
    const positionsQuery = `
      SELECT COUNT(*) as total_positions,
             COUNT(CASE WHEN status IN ('NEW', 'OPEN') THEN 1 END) as open_positions,
             COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_positions
      FROM ft_positions_v2
      WHERE run_id = $1
    `;
    
    const [devPositionsResult, stagingPositionsResult] = await Promise.all([
      devPool.query(positionsQuery, [devRun.run_id]),
      stagingPool.query(positionsQuery, [stagingRun.run_id])
    ]);
    
    console.log('\n=== DEV ===');
    console.log(`Total Positions: ${devPositionsResult.rows[0].total_positions}`);
    console.log(`Open: ${devPositionsResult.rows[0].open_positions}, Closed: ${devPositionsResult.rows[0].closed_positions}`);
    
    console.log('\n=== STAGING ===');
    console.log(`Total Positions: ${stagingPositionsResult.rows[0].total_positions}`);
    console.log(`Open: ${stagingPositionsResult.rows[0].open_positions}, Closed: ${stagingPositionsResult.rows[0].closed_positions}`);
    
    console.log('\n\n✅ Comparison complete!');
    
  } catch (error: any) {
    console.error('❌ Error comparing runs:', error.message);
    console.error(error.stack);
  } finally {
    await devPool.end();
    await stagingPool.end();
  }
}

compareRuns().catch(console.error);


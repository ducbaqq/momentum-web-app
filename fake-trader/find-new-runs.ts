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

async function findNewRuns() {
  const devPool = createPool('dev');
  const stagingPool = createPool('staging');
  
  try {
    console.log('🔍 Finding runs created in the last 24 hours...\n');
    
    const query = `
      SELECT 
        run_id, name, status, created_at, started_at, last_update,
        (SELECT COUNT(*) FROM ft_trades WHERE ft_trades.run_id = ft_runs.run_id) as trade_count,
        (SELECT COUNT(*) FROM ft_signals WHERE ft_signals.run_id = ft_runs.run_id) as signal_count
      FROM ft_runs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `;
    
    const [devRuns, stagingRuns] = await Promise.all([
      devPool.query(query),
      stagingPool.query(query)
    ]);
    
    console.log(`📊 DEV: Found ${devRuns.rows.length} runs in last 24 hours`);
    devRuns.rows.forEach((run: any) => {
      console.log(`  - ${run.name || 'Unnamed'} (${run.run_id.substring(0, 8)}...)`);
      console.log(`    Status: ${run.status}, Created: ${run.created_at}`);
      console.log(`    Trades: ${run.trade_count}, Signals: ${run.signal_count}`);
    });
    
    console.log(`\n📊 STAGING: Found ${stagingRuns.rows.length} runs in last 24 hours`);
    stagingRuns.rows.forEach((run: any) => {
      console.log(`  - ${run.name || 'Unnamed'} (${run.run_id.substring(0, 8)}...)`);
      console.log(`    Status: ${run.status}, Created: ${run.created_at}`);
      console.log(`    Trades: ${run.trade_count}, Signals: ${run.signal_count}`);
    });
    
    // Find runs with 0 trades
    const devZeroTrades = devRuns.rows.filter((r: any) => r.trade_count === '0');
    const stagingZeroTrades = stagingRuns.rows.filter((r: any) => r.trade_count === '0');
    
    console.log(`\n🚨 Runs with 0 trades:`);
    console.log(`  DEV: ${devZeroTrades.length} runs`);
    devZeroTrades.forEach((run: any) => {
      console.log(`    - ${run.name || 'Unnamed'} (${run.run_id.substring(0, 8)}...) - Created: ${run.created_at}`);
    });
    console.log(`  STAGING: ${stagingZeroTrades.length} runs`);
    stagingZeroTrades.forEach((run: any) => {
      console.log(`    - ${run.name || 'Unnamed'} (${run.run_id.substring(0, 8)}...) - Created: ${run.created_at}`);
    });
    
    // If we found a dev run with 0 trades, analyze it
    if (devZeroTrades.length > 0) {
      const devRun = devZeroTrades[0];
      console.log(`\n🔍 Analyzing dev run with 0 trades: ${devRun.run_id.substring(0, 8)}...`);
      
      // Get signals
      const signalsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN executed = true THEN 1 END) as executed,
          COUNT(CASE WHEN executed = false THEN 1 END) as rejected,
          rejection_reason,
          COUNT(*) as count
        FROM ft_signals
        WHERE run_id = $1
        GROUP BY rejection_reason
        ORDER BY count DESC
      `;
      const signalsResult = await devPool.query(signalsQuery, [devRun.run_id]);
      
      console.log(`\n  Signals:`);
      if (signalsResult.rows.length === 0) {
        console.log(`    ⚠️  No signals found - strategy may not be running or no candles processed`);
      } else {
        signalsResult.rows.forEach((row: any) => {
          console.log(`    ${row.rejection_reason || 'N/A'}: ${row.count} signals`);
        });
      }
      
      // Get last processed candle
      const candleQuery = `SELECT last_processed_candle FROM ft_runs WHERE run_id = $1`;
      const candleResult = await devPool.query(candleQuery, [devRun.run_id]);
      const lastCandle = candleResult.rows[0]?.last_processed_candle;
      console.log(`\n  Last Processed Candle: ${lastCandle || 'NULL (no candles processed yet)'}`);
      
      // Check run status
      const runQuery = `SELECT status, error FROM ft_runs WHERE run_id = $1`;
      const runResult = await devPool.query(runQuery, [devRun.run_id]);
      const run = runResult.rows[0];
      console.log(`  Status: ${run.status}`);
      if (run.error) {
        console.log(`  Error: ${run.error}`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await devPool.end();
    await stagingPool.end();
  }
}

findNewRuns().catch(console.error);


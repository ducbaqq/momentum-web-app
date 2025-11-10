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

async function checkTrades() {
  const devPool = createPool('dev');
  const stagingPool = createPool('staging');
  
  try {
    const devRunId = '3a92f68d-39df-48f7-b5fc-4a95554dd7d7'; // Dev run
    const stagingRunId = 'c585d026-3a7f-444a-b311-ab6b181d3cb5'; // Staging run
    
    console.log('🔍 Checking DEV run:', devRunId);
    
    // Check DEV
    const devFtTradesQuery = `SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1`;
    const devFtTradesResult = await devPool.query(devFtTradesQuery, [devRunId]);
    
    const devPositionsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed,
        COUNT(CASE WHEN status IN ('NEW', 'OPEN') THEN 1 END) as open
      FROM ft_positions_v2
      WHERE run_id = $1
    `;
    const devPositionsResult = await devPool.query(devPositionsQuery, [devRunId]);
    const devPos = devPositionsResult.rows[0];
    
    const devUiQuery = `
      SELECT COUNT(*) as count
      FROM ft_positions_v2 
      WHERE run_id = $1 AND status = 'CLOSED'
    `;
    const devUiResult = await devPool.query(devUiQuery, [devRunId]);
    
    console.log(`\n📊 DEV:`);
    console.log(`  ft_trades: ${devFtTradesResult.rows[0].count} trades`);
    console.log(`  ft_positions_v2: ${devPos.closed} closed positions`);
    console.log(`  UI would show: ${devUiResult.rows[0].count} trades`);
    
    // Check STAGING
    console.log(`\n🔍 Checking STAGING run:`, stagingRunId);
    
    const stagingFtTradesQuery = `SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1`;
    const stagingFtTradesResult = await stagingPool.query(stagingFtTradesQuery, [stagingRunId]);
    
    const stagingPositionsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed,
        COUNT(CASE WHEN status IN ('NEW', 'OPEN') THEN 1 END) as open
      FROM ft_positions_v2
      WHERE run_id = $1
    `;
    const stagingPositionsResult = await stagingPool.query(stagingPositionsQuery, [stagingRunId]);
    const stagingPos = stagingPositionsResult.rows[0];
    
    const stagingUiQuery = `
      SELECT COUNT(*) as count
      FROM ft_positions_v2 
      WHERE run_id = $1 AND status = 'CLOSED'
    `;
    const stagingUiResult = await stagingPool.query(stagingUiQuery, [stagingRunId]);
    
    console.log(`\n📊 STAGING:`);
    console.log(`  ft_trades: ${stagingFtTradesResult.rows[0].count} trades`);
    console.log(`  ft_positions_v2: ${stagingPos.closed} closed positions`);
    console.log(`  UI would show: ${stagingUiResult.rows[0].count} trades`);
    
    console.log(`\n🔍 CONCLUSION:`);
    if (devUiResult.rows[0].count === '0' && devFtTradesResult.rows[0].count !== '0') {
      console.log(`  ❌ DEV: Trades exist in ft_trades but UI shows 0 (queries ft_positions_v2)`);
    }
    if (stagingUiResult.rows[0].count !== '0') {
      console.log(`  ✅ STAGING: UI shows ${stagingUiResult.rows[0].count} trades`);
    } else if (stagingFtTradesResult.rows[0].count !== '0') {
      console.log(`  ❌ STAGING: Trades exist in ft_trades but UI shows 0 (queries ft_positions_v2)`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await devPool.end();
    await stagingPool.end();
  }
}

checkTrades().catch(console.error);


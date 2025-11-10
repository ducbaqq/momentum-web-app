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

async function checkTradeDates() {
  const devPool = createPool('dev');
  
  try {
    const runId = '3a92f68d-39df-48f7-b5fc-4a95554dd7d7'; // Dev run
    
    // Get run creation date
    const runQuery = `SELECT created_at, started_at FROM ft_runs WHERE run_id = $1`;
    const runResult = await devPool.query(runQuery, [runId]);
    const run = runResult.rows[0];
    
    console.log('📅 RUN INFO:');
    console.log(`  Created: ${run.created_at}`);
    console.log(`  Started: ${run.started_at}`);
    
    // Get all trades with timestamps
    const tradesQuery = `
      SELECT 
        trade_id,
        symbol,
        side,
        entry_ts,
        exit_ts,
        status,
        realized_pnl
      FROM ft_trades
      WHERE run_id = $1
      ORDER BY entry_ts ASC
    `;
    const tradesResult = await devPool.query(tradesQuery, [runId]);
    
    console.log(`\n📊 TRADES (${tradesResult.rows.length} total):`);
    console.log(`  First trade: ${tradesResult.rows[0]?.entry_ts || 'N/A'}`);
    console.log(`  Last trade: ${tradesResult.rows[tradesResult.rows.length - 1]?.entry_ts || 'N/A'}`);
    
    console.log(`\n📋 All trades:`);
    tradesResult.rows.forEach((trade: any, i: number) => {
      console.log(`  ${i + 1}. ${trade.symbol} ${trade.side} - Entry: ${trade.entry_ts}, Exit: ${trade.exit_ts || 'OPEN'}, PnL: ${trade.realized_pnl}`);
    });
    
    // Check if run was created on Nov 4, 2025
    const runDate = new Date(run.created_at);
    const nov4 = new Date('2025-11-04');
    const isNov4 = runDate.getFullYear() === 2025 && 
                   runDate.getMonth() === 10 && // November is month 10 (0-indexed)
                   runDate.getDate() === 4;
    
    console.log(`\n🔍 ANALYSIS:`);
    console.log(`  Run created on Nov 4, 2025: ${isNov4 ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Run date: ${runDate.toISOString().split('T')[0]}`);
    
    if (tradesResult.rows.length > 0) {
      const firstTradeDate = new Date(tradesResult.rows[0].entry_ts);
      const lastTradeDate = new Date(tradesResult.rows[tradesResult.rows.length - 1].entry_ts);
      console.log(`  First trade: ${firstTradeDate.toISOString().split('T')[0]}`);
      console.log(`  Last trade: ${lastTradeDate.toISOString().split('T')[0]}`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await devPool.end();
  }
}

checkTradeDates().catch(console.error);


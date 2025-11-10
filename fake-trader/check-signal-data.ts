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

async function checkSignalData() {
  const stagingPool = createPool('staging');
  
  try {
    const runId = 'c585d026-3a7f-444a-b311-ab6b181d3cb5';
    
    console.log('🔍 Checking signal data for run:', runId);
    
    // Get signals that were executed to see what stopLoss/takeProfit values were in the signal
    const signalsQuery = `
      SELECT 
        signal_id,
        symbol,
        side,
        signal_ts,
        executed,
        candle_data,
        execution_notes
      FROM ft_signals
      WHERE run_id = $1
      AND symbol = 'ATOMUSDT'
      AND executed = true
      ORDER BY signal_ts ASC
    `;
    
    const signalsResult = await stagingPool.query(signalsQuery, [runId]);
    
    console.log(`\n📡 Executed signals for ATOMUSDT:\n`);
    
    for (const signal of signalsResult.rows) {
      console.log(`${signal.signal_ts} - ${signal.side}`);
      console.log(`  Executed: ${signal.executed}`);
      if (signal.candle_data) {
        const candle = typeof signal.candle_data === 'string' 
          ? JSON.parse(signal.candle_data) 
          : signal.candle_data;
        console.log(`  Candle close: $${candle.close?.toFixed(2) || 'N/A'}`);
        console.log(`  Expected stop loss: $${(candle.close * 0.98).toFixed(2)}`);
        console.log(`  Expected take profit: $${(candle.close * 1.03).toFixed(2)}`);
      }
      if (signal.execution_notes) {
        console.log(`  Notes: ${signal.execution_notes}`);
      }
      console.log('');
    }
    
    // Check the actual positions created from these signals
    const positionsQuery = `
      SELECT 
        p.position_id,
        p.symbol,
        p.side,
        p.entry_price,
        p.stop_loss,
        p.take_profit,
        p.opened_at,
        p.status
      FROM ft_positions p
      WHERE p.run_id = $1
      AND p.symbol = 'ATOMUSDT'
      ORDER BY p.opened_at ASC
    `;
    
    const positionsResult = await stagingPool.query(positionsQuery, [runId]);
    
    console.log(`\n📍 Positions created:\n`);
    
    for (const pos of positionsResult.rows) {
      const entryPrice = Number(pos.entry_price);
      const stopLoss = pos.stop_loss ? Number(pos.stop_loss) : null;
      const takeProfit = pos.take_profit ? Number(pos.take_profit) : null;
      
      console.log(`Position ${pos.position_id.substring(0, 8)}...`);
      console.log(`  ${pos.side} @ $${entryPrice.toFixed(2)}`);
      console.log(`  Stop Loss: ${stopLoss ? `$${stopLoss.toFixed(2)}` : 'NULL ❌'}`);
      console.log(`  Take Profit: ${takeProfit ? `$${takeProfit.toFixed(2)}` : 'NULL ❌'}`);
      console.log(`  Expected SL: $${(entryPrice * 0.98).toFixed(2)}`);
      console.log(`  Expected TP: $${(entryPrice * 1.03).toFixed(2)}`);
      console.log(`  Opened: ${pos.opened_at}`);
      console.log('');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await stagingPool.end();
  }
}

checkSignalData().catch(console.error);


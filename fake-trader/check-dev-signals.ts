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

async function checkDevSignals() {
  const devPool = createPool('dev');
  
  try {
    const devRunId = '064d2905-bc80-46b4-b836-a64499817ffe';
    
    // Get all signals for ATOMUSDT around the time staging executed
    const targetTime = '2025-11-10T09:47:01';
    const beforeTime = '2025-11-10T09:42:01';
    const afterTime = '2025-11-10T09:52:01';
    
    const devSignalsQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_type,
        side,
        signal_ts,
        executed,
        rejection_reason,
        candle_data,
        strategy_state
      FROM ft_signals
      WHERE run_id = $1
      AND symbol = 'ATOMUSDT'
      AND signal_ts >= $2
      AND signal_ts <= $3
      ORDER BY signal_ts ASC
    `;
    
    const devSignalsResult = await devPool.query(devSignalsQuery, [devRunId, beforeTime, afterTime]);
    
    console.log(`\n📡 DEV SIGNALS FOR ATOMUSDT (${beforeTime} to ${afterTime}): ${devSignalsResult.rows.length}\n`);
    
    devSignalsResult.rows.forEach((signal, i) => {
      const candle = typeof signal.candle_data === 'string' ? JSON.parse(signal.candle_data) : signal.candle_data;
      const strategyState = typeof signal.strategy_state === 'string' ? JSON.parse(signal.strategy_state) : signal.strategy_state;
      
      console.log(`${i + 1}. ${signal.signal_ts}`);
      console.log(`   Type: ${signal.signal_type}, Side: ${signal.side || 'N/A'}`);
      console.log(`   Executed: ${signal.executed}`);
      console.log(`   Rejection: ${signal.rejection_reason || 'N/A'}`);
      console.log(`   Candle Close: $${candle.close?.toFixed(2)}`);
      console.log(`   Candle TS: ${candle.ts}`);
      console.log(`   ROC 5m: ${candle.roc_5m}`);
      console.log(`   Volume Mult: ${candle.volume_multiplier}`);
      console.log(`   Spread BPS: ${candle.spread_bps}`);
      console.log(`   Strategy State Capital: $${strategyState?.currentCapital || 'N/A'}`);
      console.log(`   Strategy State Positions: ${strategyState?.positions?.length || 0}`);
      console.log('');
    });
    
    // Check if there are any signals with the same candle timestamp
    const stagingCandleTs = '2025-11-10T09:45:00.000Z';
    const devSameCandleQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_ts,
        executed,
        rejection_reason,
        candle_data
      FROM ft_signals
      WHERE run_id = $1
      AND symbol = 'ATOMUSDT'
      AND candle_data::text LIKE $2
      ORDER BY signal_ts ASC
    `;
    
    const devSameCandleResult = await devPool.query(devSameCandleQuery, [
      devRunId,
      `%"ts":"${stagingCandleTs.substring(0, 19)}%`
    ]);
    
    console.log(`\n🔍 DEV SIGNALS WITH SAME CANDLE TS (${stagingCandleTs}): ${devSameCandleResult.rows.length}\n`);
    
    devSameCandleResult.rows.forEach((signal, i) => {
      const candle = typeof signal.candle_data === 'string' ? JSON.parse(signal.candle_data) : signal.candle_data;
      console.log(`${i + 1}. Signal TS: ${signal.signal_ts}`);
      console.log(`   Candle TS: ${candle.ts}`);
      console.log(`   Executed: ${signal.executed}`);
      console.log(`   Rejection: ${signal.rejection_reason || 'N/A'}`);
      console.log(`   Candle Close: $${candle.close?.toFixed(2)}`);
      console.log(`   ROC 5m: ${candle.roc_5m}`);
      console.log('');
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await devPool.end();
  }
}

checkDevSignals().catch(console.error);


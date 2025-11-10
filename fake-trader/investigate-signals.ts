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

async function investigateSignals() {
  const stagingPool = createPool('staging');
  const devPool = createPool('dev');
  
  try {
    const stagingRunId = '02fac408-45b9-4768-95ce-2cfc2485233c';
    const devRunId = '064d2905-bc80-46b4-b836-a64499817ffe';
    
    // Get executed signals from staging
    const stagingExecutedQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_type,
        side,
        size,
        price,
        signal_ts,
        executed,
        execution_price,
        execution_notes,
        rejection_reason,
        candle_data
      FROM ft_signals
      WHERE run_id = $1
      AND executed = true
      ORDER BY signal_ts ASC
    `;
    
    const stagingExecutedResult = await stagingPool.query(stagingExecutedQuery, [stagingRunId]);
    console.log(`\n✅ STAGING EXECUTED SIGNALS: ${stagingExecutedResult.rows.length}\n`);
    
    stagingExecutedResult.rows.forEach((signal, i) => {
      console.log(`${i + 1}. ${signal.signal_ts}`);
      console.log(`   Symbol: ${signal.symbol}`);
      console.log(`   Type: ${signal.signal_type}, Side: ${signal.side}`);
      console.log(`   Size: ${signal.size}, Price: ${signal.price}`);
      console.log(`   Execution Price: ${signal.execution_price}`);
      console.log(`   Notes: ${signal.execution_notes}`);
      if (signal.candle_data) {
        const candle = typeof signal.candle_data === 'string' ? JSON.parse(signal.candle_data) : signal.candle_data;
        console.log(`   Candle Close: $${candle.close?.toFixed(2) || 'N/A'}`);
        console.log(`   Candle TS: ${candle.ts || 'N/A'}`);
      }
      console.log('');
    });
    
    // Check what signals dev had around the same time
    if (stagingExecutedResult.rows.length > 0) {
      const firstExecutedSignal = stagingExecutedResult.rows[0];
      const signalTime = new Date(firstExecutedSignal.signal_ts);
      const beforeTime = new Date(signalTime.getTime() - 5 * 60 * 1000); // 5 minutes before
      const afterTime = new Date(signalTime.getTime() + 5 * 60 * 1000); // 5 minutes after
      
      const devSignalsQuery = `
        SELECT 
          signal_id,
          symbol,
          signal_type,
          side,
          size,
          price,
          signal_ts,
          executed,
          execution_price,
          execution_notes,
          rejection_reason,
          candle_data
        FROM ft_signals
        WHERE run_id = $1
        AND signal_ts >= $2
        AND signal_ts <= $3
        ORDER BY signal_ts ASC
      `;
      
      const devSignalsResult = await devPool.query(devSignalsQuery, [devRunId, beforeTime.toISOString(), afterTime.toISOString()]);
      console.log(`\n🔍 DEV SIGNALS AROUND SAME TIME (${beforeTime.toISOString()} to ${afterTime.toISOString()}): ${devSignalsResult.rows.length}\n`);
      
      devSignalsResult.rows.forEach((signal, i) => {
        console.log(`${i + 1}. ${signal.signal_ts}`);
        console.log(`   Symbol: ${signal.symbol}`);
        console.log(`   Type: ${signal.signal_type}, Side: ${signal.side || 'N/A'}`);
        console.log(`   Executed: ${signal.executed}`);
        console.log(`   Rejection: ${signal.rejection_reason || 'N/A'}`);
        if (signal.candle_data) {
          const candle = typeof signal.candle_data === 'string' ? JSON.parse(signal.candle_data) : signal.candle_data;
          console.log(`   Candle Close: $${candle.close?.toFixed(2) || 'N/A'}`);
          console.log(`   Candle TS: ${candle.ts || 'N/A'}`);
        }
        console.log('');
      });
    }
    
    // Check for any LONG/SHORT signals that were rejected in dev
    const devRejectedQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_type,
        side,
        size,
        price,
        signal_ts,
        rejection_reason,
        candle_data
      FROM ft_signals
      WHERE run_id = $1
      AND (side = 'LONG' OR side = 'SHORT')
      AND executed = false
      ORDER BY signal_ts ASC
      LIMIT 20
    `;
    
    const devRejectedResult = await devPool.query(devRejectedQuery, [devRunId]);
    console.log(`\n🚫 DEV REJECTED LONG/SHORT SIGNALS: ${devRejectedResult.rows.length}\n`);
    
    devRejectedResult.rows.forEach((signal, i) => {
      console.log(`${i + 1}. ${signal.signal_ts} - ${signal.symbol} ${signal.side}`);
      console.log(`   Rejection: ${signal.rejection_reason || 'N/A'}`);
      console.log(`   Size: ${signal.size}, Price: ${signal.price}`);
      if (signal.candle_data) {
        const candle = typeof signal.candle_data === 'string' ? JSON.parse(signal.candle_data) : signal.candle_data;
        console.log(`   Candle Close: $${candle.close?.toFixed(2) || 'N/A'}`);
      }
      console.log('');
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await stagingPool.end();
    await devPool.end();
  }
}

investigateSignals().catch(console.error);


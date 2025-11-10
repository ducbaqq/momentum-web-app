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

async function compareStrategyState() {
  const stagingPool = createPool('staging');
  const devPool = createPool('dev');
  
  try {
    const stagingRunId = '02fac408-45b9-4768-95ce-2cfc2485233c';
    const devRunId = '064d2905-bc80-46b4-b836-a64499817ffe';
    
    // Get the executed signal from staging to see its strategy state
    const stagingSignalQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_ts,
        candle_data,
        strategy_state,
        execution_notes
      FROM ft_signals
      WHERE run_id = $1
      AND executed = true
      AND signal_type = 'entry'
      ORDER BY signal_ts ASC
      LIMIT 1
    `;
    
    const stagingSignalResult = await stagingPool.query(stagingSignalQuery, [stagingRunId]);
    
    if (stagingSignalResult.rows.length === 0) {
      console.log('No executed entry signal found in staging');
      return;
    }
    
    const stagingSignal = stagingSignalResult.rows[0];
    const stagingCandle = typeof stagingSignal.candle_data === 'string' 
      ? JSON.parse(stagingSignal.candle_data) 
      : stagingSignal.candle_data;
    const stagingStrategyState = typeof stagingSignal.strategy_state === 'string'
      ? JSON.parse(stagingSignal.strategy_state)
      : stagingSignal.strategy_state;
    
    console.log('📊 STAGING EXECUTED SIGNAL:');
    console.log(`  Time: ${stagingSignal.signal_ts}`);
    console.log(`  Symbol: ${stagingSignal.symbol}`);
    console.log(`  Candle Close: $${stagingCandle.close?.toFixed(2)}`);
    console.log(`  Candle TS: ${stagingCandle.ts}`);
    console.log(`  Strategy State:`, JSON.stringify(stagingStrategyState, null, 2));
    console.log(`  Candle Data (key fields):`);
    console.log(`    roc_5m: ${stagingCandle.roc_5m}`);
    console.log(`    roc_1m: ${stagingCandle.roc_1m}`);
    console.log(`    volume_multiplier: ${stagingCandle.volume_multiplier}`);
    console.log(`    spread_bps: ${stagingCandle.spread_bps}`);
    console.log(`    rsi_14: ${stagingCandle.rsi_14}`);
    
    // Get the corresponding signal from dev
    const devSignalQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_ts,
        candle_data,
        strategy_state,
        rejection_reason
      FROM ft_signals
      WHERE run_id = $1
      AND symbol = $2
      AND signal_ts = $3
    `;
    
    const devSignalResult = await devPool.query(devSignalQuery, [
      devRunId,
      stagingSignal.symbol,
      stagingSignal.signal_ts
    ]);
    
    if (devSignalResult.rows.length === 0) {
      console.log('\n❌ No corresponding signal found in dev at the same time!');
      return;
    }
    
    const devSignal = devSignalResult.rows[0];
    const devCandle = typeof devSignal.candle_data === 'string'
      ? JSON.parse(devSignal.candle_data)
      : devSignal.candle_data;
    const devStrategyState = typeof devSignal.strategy_state === 'string'
      ? JSON.parse(devSignal.strategy_state)
      : devSignal.strategy_state;
    
    console.log('\n📊 DEV SIGNAL (SAME TIME):');
    console.log(`  Time: ${devSignal.signal_ts}`);
    console.log(`  Symbol: ${devSignal.symbol}`);
    console.log(`  Executed: false`);
    console.log(`  Rejection: ${devSignal.rejection_reason}`);
    console.log(`  Candle Close: $${devCandle.close?.toFixed(2)}`);
    console.log(`  Candle TS: ${devCandle.ts}`);
    console.log(`  Strategy State:`, JSON.stringify(devStrategyState, null, 2));
    console.log(`  Candle Data (key fields):`);
    console.log(`    roc_5m: ${devCandle.roc_5m}`);
    console.log(`    roc_1m: ${devCandle.roc_1m}`);
    console.log(`    volume_multiplier: ${devCandle.volume_multiplier}`);
    console.log(`    spread_bps: ${devCandle.spread_bps}`);
    console.log(`    rsi_14: ${devCandle.rsi_14}`);
    
    // Compare key values
    console.log('\n🔍 COMPARISON:');
    console.log(`  Candle Close: Staging $${stagingCandle.close?.toFixed(2)} vs Dev $${devCandle.close?.toFixed(2)} ${stagingCandle.close === devCandle.close ? '✅' : '❌'}`);
    console.log(`  ROC 5m: Staging ${stagingCandle.roc_5m} vs Dev ${devCandle.roc_5m} ${stagingCandle.roc_5m === devCandle.roc_5m ? '✅' : '❌'}`);
    console.log(`  Volume Mult: Staging ${stagingCandle.volume_multiplier} vs Dev ${devCandle.volume_multiplier} ${stagingCandle.volume_multiplier === devCandle.volume_multiplier ? '✅' : '❌'}`);
    console.log(`  Spread BPS: Staging ${stagingCandle.spread_bps} vs Dev ${devCandle.spread_bps} ${stagingCandle.spread_bps === devCandle.spread_bps ? '✅' : '❌'}`);
    console.log(`  Current Capital: Staging $${devStrategyState?.currentCapital || 'N/A'} vs Dev $${devStrategyState?.currentCapital || 'N/A'}`);
    console.log(`  Positions: Staging ${stagingStrategyState?.positions?.length || 0} vs Dev ${devStrategyState?.positions?.length || 0}`);
    
    // Get run params to check minRoc5m threshold
    const stagingRunQuery = `SELECT params FROM ft_runs WHERE run_id = $1`;
    const stagingRunResult = await stagingPool.query(stagingRunQuery, [stagingRunId]);
    const stagingParams = typeof stagingRunResult.rows[0].params === 'string'
      ? JSON.parse(stagingRunResult.rows[0].params)
      : stagingRunResult.rows[0].params;
    
    const devRunResult = await devPool.query(stagingRunQuery, [devRunId]);
    const devParams = typeof devRunResult.rows[0].params === 'string'
      ? JSON.parse(devRunResult.rows[0].params)
      : devRunResult.rows[0].params;
    
    console.log('\n📋 PARAMS COMPARISON:');
    console.log(`  Staging minRoc5m: ${stagingParams.minRoc5m}`);
    console.log(`  Dev minRoc5m: ${devParams.minRoc5m}`);
    console.log(`  Staging minVolMult: ${stagingParams.minVolMult}`);
    console.log(`  Dev minVolMult: ${devParams.minVolMult}`);
    console.log(`  Staging maxSpreadBps: ${stagingParams.maxSpreadBps}`);
    console.log(`  Dev maxSpreadBps: ${devParams.maxSpreadBps}`);
    
    // Check if entry conditions would be met
    const rocValue = stagingCandle.roc_5m || 0;
    const volMult = stagingCandle.volume_multiplier || 0;
    const spreadBps = stagingCandle.spread_bps || 0;
    
    console.log('\n🧮 ENTRY CONDITIONS CHECK:');
    console.log(`  ROC >= minRoc5m: ${rocValue} >= ${stagingParams.minRoc5m} = ${rocValue >= stagingParams.minRoc5m} ${rocValue >= stagingParams.minRoc5m ? '✅' : '❌'}`);
    console.log(`  VolMult >= minVolMult: ${volMult} >= ${stagingParams.minVolMult} = ${volMult >= stagingParams.minVolMult} ${volMult >= stagingParams.minVolMult ? '✅' : '❌'}`);
    console.log(`  Spread <= maxSpreadBps: ${spreadBps} <= ${stagingParams.maxSpreadBps} = ${spreadBps <= stagingParams.maxSpreadBps} ${spreadBps <= stagingParams.maxSpreadBps ? '✅' : '❌'}`);
    
    // Check dev conditions
    console.log(`\n  DEV CONDITIONS:`);
    console.log(`  ROC >= minRoc5m: ${rocValue} >= ${devParams.minRoc5m} = ${rocValue >= devParams.minRoc5m} ${rocValue >= devParams.minRoc5m ? '✅' : '❌'}`);
    console.log(`  VolMult >= minVolMult: ${volMult} >= ${devParams.minVolMult} = ${volMult >= devParams.minVolMult} ${volMult >= devParams.minVolMult ? '✅' : '❌'}`);
    console.log(`  Spread <= maxSpreadBps: ${spreadBps} <= ${devParams.maxSpreadBps} = ${spreadBps <= devParams.maxSpreadBps} ${spreadBps <= devParams.maxSpreadBps ? '✅' : '❌'}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await stagingPool.end();
    await devPool.end();
  }
}

compareStrategyState().catch(console.error);


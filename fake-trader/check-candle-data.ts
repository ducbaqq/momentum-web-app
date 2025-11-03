// Script to check what candle data exists in the database
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function checkCandleData() {
  try {
    console.log('🔍 Checking candle data in database...\n');
    
    // Check total count of 1m candles
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM ohlcv_1m');
    console.log(`📊 Total 1m candles in database: ${totalCount.rows[0].count}`);
    
    // Check latest timestamp
    const latestTs = await pool.query('SELECT MAX(ts) as latest_ts FROM ohlcv_1m');
    console.log(`📅 Latest candle timestamp: ${latestTs.rows[0].latest_ts}`);
    
    // Check oldest timestamp
    const oldestTs = await pool.query('SELECT MIN(ts) as oldest_ts FROM ohlcv_1m');
    console.log(`📅 Oldest candle timestamp: ${oldestTs.rows[0].oldest_ts}`);
    
    // Check data in the last 6 hours
    const last6Hours = await pool.query(`
      SELECT COUNT(*) as count, MAX(ts) as latest_ts
      FROM ohlcv_1m
      WHERE ts >= NOW() - INTERVAL '6 hours'
    `);
    console.log(`\n📊 Candles in last 6 hours: ${last6Hours.rows[0].count}`);
    console.log(`📅 Latest in last 6 hours: ${last6Hours.rows[0].latest_ts}`);
    
    // Check symbols
    const symbols = await pool.query(`
      SELECT DISTINCT symbol, COUNT(*) as count, MAX(ts) as latest_ts
      FROM ohlcv_1m
      WHERE ts >= NOW() - INTERVAL '6 hours'
      GROUP BY symbol
      ORDER BY latest_ts DESC
      LIMIT 10
    `);
    console.log(`\n📊 Symbols with data in last 6 hours:`);
    for (const row of symbols.rows) {
      console.log(`  ${row.symbol}: ${row.count} candles, latest: ${row.latest_ts}`);
    }
    
    // Check specific symbols that the fake trader is looking for
    const targetSymbols = ['ATOMUSDT', 'AVAXUSDT', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const targetSymbolsData = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as count,
        MIN(ts) as oldest_ts,
        MAX(ts) as latest_ts
      FROM ohlcv_1m
      WHERE symbol = ANY($1)
      AND ts >= NOW() - INTERVAL '6 hours'
      GROUP BY symbol
      ORDER BY symbol
    `, [targetSymbols]);
    
    console.log(`\n📊 Target symbols data in last 6 hours:`);
    if (targetSymbolsData.rows.length === 0) {
      console.log('  ❌ No data found for target symbols in last 6 hours');
      
      // Check without time filter
      const allTargetData = await pool.query(`
        SELECT 
          symbol,
          COUNT(*) as count,
          MIN(ts) as oldest_ts,
          MAX(ts) as latest_ts
        FROM ohlcv_1m
        WHERE symbol = ANY($1)
        GROUP BY symbol
        ORDER BY symbol
      `, [targetSymbols]);
      
      console.log(`\n📊 Target symbols data (all time):`);
      for (const row of allTargetData.rows) {
        console.log(`  ${row.symbol}: ${row.count} candles, latest: ${row.latest_ts}`);
      }
    } else {
      for (const row of targetSymbolsData.rows) {
        console.log(`  ${row.symbol}: ${row.count} candles, latest: ${row.latest_ts}`);
      }
    }
    
    // Simulate the exact query the fake trader uses
    const now = new Date();
    const startTime = new Date(now.getTime() - 300 * 60 * 1000); // 5 hours ago
    console.log(`\n🔍 Simulating fake trader query:`);
    console.log(`  Time range: ${startTime.toISOString()} to ${now.toISOString()}`);
    
    const fakeTraderQuery = await pool.query(`
      SELECT COUNT(*) as count
      FROM ohlcv_1m o
      WHERE o.symbol = ANY($1) 
      AND o.ts >= $2::timestamp 
      AND o.ts <= $3::timestamp
    `, [targetSymbols, startTime.toISOString(), now.toISOString()]);
    
    console.log(`  Result: ${fakeTraderQuery.rows[0].count} candles found`);
    
  } catch (error: any) {
    console.error('❌ Error checking candle data:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkCandleData();


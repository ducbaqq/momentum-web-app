import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function getMomentumCollectorUrl(): string {
  if (process.env.DB_BASE_URL) {
    return `${process.env.DB_BASE_URL}/momentum_collector`;
  }
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
    // Replace database name with momentum_collector
    const match = baseUrl.match(/\/([^/?]+)(\?|$)/);
    if (match) {
      return baseUrl.replace(/\/([^/?]+)(\?|$)/, `/momentum_collector$2`);
    }
  }
  throw new Error('Cannot determine momentum_collector database URL');
}

function createPool(): Pool {
  const url = getMomentumCollectorUrl();
  const isDigitalOcean = url.includes('ondigitalocean') || url.includes('ssl') || url.includes('sslmode=require');
  return new Pool({
    connectionString: url,
    ssl: isDigitalOcean ? { rejectUnauthorized: false } : false,
    max: 3,
  });
}

async function checkMomentumCollectorData() {
  const pool = createPool();
  
  try {
    // Check the specific candle that staging executed on
    const candleTs = '2025-11-10T09:45:00.000Z';
    const symbol = 'ATOMUSDT';
    
    console.log(`🔍 Checking momentum_collector database for:`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Timestamp: ${candleTs}\n`);
    
    // Check ohlcv_1m
    const ohlcvQuery = `
      SELECT 
        symbol,
        ts,
        open,
        high,
        low,
        close,
        volume
      FROM ohlcv_1m
      WHERE symbol = $1
      AND ts = $2::timestamp
    `;
    
    const ohlcvResult = await pool.query(ohlcvQuery, [symbol, candleTs]);
    console.log(`📊 OHLCV_1M: ${ohlcvResult.rows.length} row(s)`);
    if (ohlcvResult.rows.length > 0) {
      const row = ohlcvResult.rows[0];
      console.log(`  Close: $${Number(row.close).toFixed(2)}`);
      console.log(`  Volume: ${Number(row.volume).toFixed(2)}`);
    } else {
      console.log('  ❌ No OHLCV data found!');
    }
    
    // Check features_1m
    const featuresQuery = `
      SELECT 
        symbol,
        ts,
        roc_1m,
        roc_5m,
        roc_15m,
        vol_mult,
        spread_bps,
        rsi_14
      FROM features_1m
      WHERE symbol = $1
      AND ts = $2::timestamp
    `;
    
    const featuresResult = await pool.query(featuresQuery, [symbol, candleTs]);
    console.log(`\n📈 FEATURES_1M: ${featuresResult.rows.length} row(s)`);
    if (featuresResult.rows.length > 0) {
      const row = featuresResult.rows[0];
      console.log(`  ROC 5m: ${row.roc_5m}`);
      console.log(`  ROC 1m: ${row.roc_1m}`);
      console.log(`  Vol Mult: ${row.vol_mult !== null ? row.vol_mult : 'NULL ❌'}`);
      console.log(`  Spread BPS: ${row.spread_bps}`);
      console.log(`  RSI 14: ${row.rsi_14}`);
    } else {
      console.log('  ❌ No features data found!');
    }
    
    // Check nearby timestamps to see if features exist
    const nearbyQuery = `
      SELECT 
        ts,
        roc_5m,
        vol_mult,
        spread_bps
      FROM features_1m
      WHERE symbol = $1
      AND ts >= $2::timestamp - INTERVAL '5 minutes'
      AND ts <= $2::timestamp + INTERVAL '5 minutes'
      ORDER BY ts ASC
    `;
    
    const nearbyResult = await pool.query(nearbyQuery, [symbol, candleTs]);
    console.log(`\n🔍 NEARBY FEATURES (5 min before/after): ${nearbyResult.rows.length} row(s)`);
    nearbyResult.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.ts} - ROC 5m: ${row.roc_5m}, Vol Mult: ${row.vol_mult !== null ? row.vol_mult : 'NULL'}, Spread: ${row.spread_bps}`);
    });
    
    // Check if there are any NULL vol_mult values around this time
    const nullVolMultQuery = `
      SELECT 
        COUNT(*) as null_count,
        COUNT(*) FILTER (WHERE vol_mult IS NOT NULL) as not_null_count
      FROM features_1m
      WHERE symbol = $1
      AND ts >= $2::timestamp - INTERVAL '1 hour'
      AND ts <= $2::timestamp + INTERVAL '1 hour'
    `;
    
    const nullVolMultResult = await pool.query(nullVolMultQuery, [symbol, candleTs]);
    console.log(`\n📊 VOL_MULT STATS (1 hour window):`);
    console.log(`  NULL: ${nullVolMultResult.rows[0].null_count - nullVolMultResult.rows[0].not_null_count}`);
    console.log(`  NOT NULL: ${nullVolMultResult.rows[0].not_null_count}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkMomentumCollectorData().catch(console.error);


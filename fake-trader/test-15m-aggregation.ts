import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function getMomentumCollectorUrl(): string {
  if (process.env.DB_BASE_URL) {
    return `${process.env.DB_BASE_URL}/momentum_collector`;
  }
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
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

async function test15mAggregation() {
  const pool = createPool();
  
  try {
    const symbol = 'ATOMUSDT';
    const targetPeriod = '2025-11-10T09:45:00.000Z'; // The 15m bucket we're looking for
    const periodEnd = '2025-11-10T10:00:00.000Z';
    
    console.log(`🔍 Testing 15m aggregation for:`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Period: ${targetPeriod} to ${periodEnd}\n`);
    
    // Test the exact query that getCompleted15mCandles uses
    const query = `
      WITH aggregated_15m_candles AS (
        SELECT 
          o.symbol,
          to_timestamp(floor(extract(epoch from o.ts) / (15*60)) * (15*60)) AT TIME ZONE 'UTC' as candle_start,
          AVG(o.open::double precision) as open,
          MAX(o.high::double precision) as high,
          MIN(o.low::double precision) as low,
          AVG(o.close::double precision) as close,
          SUM(o.volume::double precision) as volume,
          -- Aggregate features - use the latest values in each 15m period
          AVG(COALESCE(f.roc_5m, 0)) as roc_5m,
          AVG(COALESCE(f.vol_mult, 1)) as vol_mult,
          AVG(COALESCE(f.roc_1m, 0)) as roc_1m,
          AVG(COALESCE(f.spread_bps, 5)) as spread_bps,
          COUNT(*) as minute_count
        FROM ohlcv_1m o
        LEFT JOIN features_1m f ON f.symbol = o.symbol AND f.ts = o.ts
        WHERE o.symbol = $1
          AND o.ts >= $2::timestamp 
          AND o.ts < $3::timestamp
        GROUP BY o.symbol, candle_start
        HAVING COUNT(*) >= 10  -- Ensure we have most of the 15m period data
      )
      SELECT 
        symbol,
        candle_start as ts,
        open, high, low, close, volume,
        roc_5m, vol_mult, roc_1m, spread_bps,
        minute_count
      FROM aggregated_15m_candles
      WHERE candle_start = $2::timestamp  -- Only get the target period
      ORDER BY symbol
    `;
    
    const result = await pool.query(query, [symbol, targetPeriod, periodEnd]);
    
    console.log(`📊 AGGREGATION RESULT: ${result.rows.length} row(s)\n`);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`  Candle Start: ${row.ts}`);
      console.log(`  Close: $${Number(row.close).toFixed(2)}`);
      console.log(`  ROC 5m: ${Number(row.roc_5m).toFixed(6)}`);
      console.log(`  Vol Mult: ${Number(row.vol_mult).toFixed(6)}`);
      console.log(`  Spread BPS: ${Number(row.spread_bps).toFixed(2)}`);
      console.log(`  Minute Count: ${row.minute_count}`);
    } else {
      console.log('  ❌ No aggregated candle found!');
      
      // Check what 1m candles exist in this period
      const checkQuery = `
        SELECT 
          o.ts,
          o.close,
          f.roc_5m,
          f.vol_mult,
          f.spread_bps
        FROM ohlcv_1m o
        LEFT JOIN features_1m f ON f.symbol = o.symbol AND f.ts = o.ts
        WHERE o.symbol = $1
          AND o.ts >= $2::timestamp 
          AND o.ts < $3::timestamp
        ORDER BY o.ts ASC
      `;
      
      const checkResult = await pool.query(checkQuery, [symbol, targetPeriod, periodEnd]);
      console.log(`\n🔍 1M CANDLES IN PERIOD: ${checkResult.rows.length} row(s)`);
      checkResult.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.ts} - Close: $${Number(row.close).toFixed(2)}, ROC 5m: ${row.roc_5m}, Vol Mult: ${row.vol_mult !== null ? row.vol_mult : 'NULL'}, Spread: ${row.spread_bps}`);
      });
      
      // Check what buckets are created
      const bucketQuery = `
        SELECT 
          to_timestamp(floor(extract(epoch from o.ts) / (15*60)) * (15*60)) AT TIME ZONE 'UTC' as bucket,
          COUNT(*) as count
        FROM ohlcv_1m o
        WHERE o.symbol = $1
          AND o.ts >= $2::timestamp - INTERVAL '30 minutes'
          AND o.ts < $3::timestamp + INTERVAL '30 minutes'
        GROUP BY bucket
        ORDER BY bucket
      `;
      
      const bucketResult = await pool.query(bucketQuery, [symbol, targetPeriod, periodEnd]);
      console.log(`\n🪣 BUCKETS CREATED:`);
      bucketResult.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.bucket} - ${row.count} candles`);
      });
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

test15mAggregation().catch(console.error);


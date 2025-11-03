// Script to check momentum-collector health and diagnose why it stopped
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/momentum_collector',
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function diagnoseCollector() {
  try {
    console.log('🔍 Diagnosing momentum-collector status...\n');
    
    // Check latest data timestamps
    const latestOhlcv = await pool.query(`
      SELECT MAX(ts) as latest_ts, COUNT(*) as total_count
      FROM ohlcv_1m
    `);
    
    const latestFeatures = await pool.query(`
      SELECT MAX(ts) as latest_ts, COUNT(*) as total_count
      FROM features_1m
    `);
    
    const latestL1 = await pool.query(`
      SELECT MAX(ts) as latest_ts, COUNT(*) as total_count
      FROM l1_snapshots
    `);
    
    const latestOhlcvTs = latestOhlcv.rows[0].latest_ts;
    const latestFeaturesTs = latestFeatures.rows[0].latest_ts;
    const latestL1Ts = latestL1.rows[0].latest_ts;
    
    console.log('📊 Latest Data Timestamps:');
    console.log(`  OHLCV: ${latestOhlcvTs} (${latestOhlcv.rows[0].total_count} total)`);
    console.log(`  Features: ${latestFeaturesTs} (${latestFeatures.rows[0].total_count} total)`);
    console.log(`  L1 Snapshots: ${latestL1Ts} (${latestL1.rows[0].total_count} total)`);
    
    const now = new Date();
    const hoursAgoOhlcv = latestOhlcvTs ? (now.getTime() - new Date(latestOhlcvTs).getTime()) / (1000 * 60 * 60) : null;
    const hoursAgoFeatures = latestFeaturesTs ? (now.getTime() - new Date(latestFeaturesTs).getTime()) / (1000 * 60 * 60) : null;
    const hoursAgoL1 = latestL1Ts ? (now.getTime() - new Date(latestL1Ts).getTime()) / (1000 * 60 * 60) : null;
    
    console.log('\n⏰ Time Since Last Data:');
    if (hoursAgoOhlcv !== null) {
      console.log(`  OHLCV: ${hoursAgoOhlcv.toFixed(1)} hours ago ${hoursAgoOhlcv > 24 ? '⚠️' : hoursAgoOhlcv > 2 ? '🔴' : '✅'}`);
    }
    if (hoursAgoFeatures !== null) {
      console.log(`  Features: ${hoursAgoFeatures.toFixed(1)} hours ago ${hoursAgoFeatures > 24 ? '⚠️' : hoursAgoFeatures > 2 ? '🔴' : '✅'}`);
    }
    if (hoursAgoL1 !== null) {
      console.log(`  L1: ${hoursAgoL1.toFixed(1)} hours ago ${hoursAgoL1 > 24 ? '⚠️' : hoursAgoL1 > 2 ? '🔴' : '✅'}`);
    }
    
    // Check data in last hour
    const recentOhlcv = await pool.query(`
      SELECT COUNT(*) as count, MAX(ts) as latest_ts
      FROM ohlcv_1m
      WHERE ts >= NOW() - INTERVAL '1 hour'
    `);
    
    console.log('\n📈 Data in Last Hour:');
    console.log(`  OHLCV candles: ${recentOhlcv.rows[0].count}`);
    
    // Check per-symbol activity
    const symbolActivity = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as count,
        MAX(ts) as latest_ts
      FROM ohlcv_1m
      WHERE ts >= NOW() - INTERVAL '6 hours'
      GROUP BY symbol
      ORDER BY latest_ts DESC
      LIMIT 10
    `);
    
    console.log('\n📊 Symbol Activity (Last 6 Hours):');
    if (symbolActivity.rows.length === 0) {
      console.log('  ❌ No data for any symbols in last 6 hours');
    } else {
      for (const row of symbolActivity.rows) {
        const hoursAgo = row.latest_ts ? (now.getTime() - new Date(row.latest_ts).getTime()) / (1000 * 60 * 60) : null;
        console.log(`  ${row.symbol}: ${row.count} candles, latest: ${row.latest_ts} (${hoursAgo?.toFixed(1)}h ago)`);
      }
    }
    
    // Summary
    console.log('\n📋 Summary:');
    if (hoursAgoOhlcv !== null && hoursAgoOhlcv > 24) {
      console.log('  ❌ Collector appears to be stopped - no data in over 24 hours');
      console.log('  💡 Check DigitalOcean app logs and deployment status');
      console.log('  💡 Verify WebSocket connection to Binance is working');
      console.log('  💡 Check if collector app is running and healthy');
    } else if (hoursAgoOhlcv !== null && hoursAgoOhlcv > 2) {
      console.log('  ⚠️  Collector may be experiencing issues - data is stale');
      console.log('  💡 Check WebSocket reconnection logic');
      console.log('  💡 Verify Binance API is accessible');
    } else {
      console.log('  ✅ Collector appears to be running normally');
    }
    
  } catch (error: any) {
    console.error('❌ Error diagnosing collector:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

diagnoseCollector();


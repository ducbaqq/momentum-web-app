#!/usr/bin/env node
/**
 * Fix Database Performance Issues
 * Run this script to add missing indexes that are causing 100% CPU usage
 * 
 * Usage: node fix-db-performance.js
 */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set');
  console.error('   Please set it or create a .env file with DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function fixPerformance() {
  console.log('🔧 Starting database performance fixes...\n');
  
  try {
    // 1. Critical indexes for /api/ticks/latest query
    console.log('1. Creating index for ohlcv_1m (symbol, ts DESC)...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_desc 
      ON ohlcv_1m(symbol, ts DESC);
    `);
    console.log('   ✅ Created idx_ohlcv_1m_symbol_ts_desc\n');

    console.log('2. Creating index for ohlcv_1m (symbol, ts ASC)...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol_ts_asc 
      ON ohlcv_1m(symbol, ts ASC);
    `);
    console.log('   ✅ Created idx_ohlcv_1m_symbol_ts_asc\n');

    // 2. Critical index for features_1m JOIN
    console.log('3. Creating index for features_1m (symbol, ts)...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_features_1m_symbol_ts 
      ON features_1m(symbol, ts);
    `);
    console.log('   ✅ Created idx_features_1m_symbol_ts\n');

    // 3. Index for /api/symbols query
    console.log('4. Creating index for ohlcv_1m (symbol)...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_symbol 
      ON ohlcv_1m(symbol);
    `);
    console.log('   ✅ Created idx_ohlcv_1m_symbol\n');

    // 4. Index for timestamp filtering
    console.log('5. Creating index for ohlcv_1m (ts DESC, symbol)...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_ts_symbol 
      ON ohlcv_1m(ts DESC, symbol);
    `);
    console.log('   ✅ Created idx_ohlcv_1m_ts_symbol\n');

    // 5. Analyze tables to update query planner statistics
    console.log('6. Analyzing ohlcv_1m table...');
    await pool.query('ANALYZE ohlcv_1m;');
    console.log('   ✅ Analyzed ohlcv_1m\n');

    console.log('7. Analyzing features_1m table...');
    await pool.query('ANALYZE features_1m;');
    console.log('   ✅ Analyzed features_1m\n');

    console.log('✅ All performance fixes completed successfully!');
    console.log('\n💡 The database should now run much faster. Monitor CPU usage.');
    
  } catch (error) {
    console.error('❌ Error fixing performance:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixPerformance();


// Script to diagnose database connection pool issues
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('digitalocean.com') ? { rejectUnauthorized: false } : false,
  max: 6, // Same as collector
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function diagnosePool() {
  try {
    console.log('🔍 Diagnosing database connection pool...\n');
    
    // Check active connections
    const activeConnections = await pool.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
    `);
    
    console.log('📊 Connection Pool Status:');
    console.log(`  Total connections: ${activeConnections.rows[0].total_connections}`);
    console.log(`  Active: ${activeConnections.rows[0].active}`);
    console.log(`  Idle: ${activeConnections.rows[0].idle}`);
    console.log(`  Idle in transaction: ${activeConnections.rows[0].idle_in_transaction}`);
    
    // Check for long-running queries
    const longQueries = await pool.query(`
      SELECT 
        pid,
        usename,
        application_name,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        query
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state != 'idle'
        AND now() - query_start > interval '5 seconds'
      ORDER BY query_start
    `);
    
    if (longQueries.rows.length > 0) {
      console.log('\n⚠️  Long-running queries (>5 seconds):');
      for (const row of longQueries.rows) {
        const duration = new Date().getTime() - new Date(row.query_start).getTime();
        console.log(`  PID ${row.pid}: ${row.state} (${Math.round(duration/1000)}s)`);
        console.log(`    Query: ${row.query.substring(0, 100)}...`);
      }
    } else {
      console.log('\n✅ No long-running queries detected');
    }
    
    // Check for connections waiting on locks
    const waitingConnections = await pool.query(`
      SELECT 
        pid,
        usename,
        application_name,
        wait_event_type,
        wait_event,
        query
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND wait_event_type IS NOT NULL
        AND wait_event_type != 'Client'
    `);
    
    if (waitingConnections.rows.length > 0) {
      console.log('\n⚠️  Connections waiting on locks:');
      for (const row of waitingConnections.rows) {
        console.log(`  PID ${row.pid}: waiting on ${row.wait_event_type}/${row.wait_event}`);
      }
    } else {
      console.log('\n✅ No connections waiting on locks');
    }
    
    // Check pool statistics
    console.log('\n📊 Pool Statistics:');
    console.log(`  Total clients: ${pool.totalCount}`);
    console.log(`  Idle clients: ${pool.idleCount}`);
    console.log(`  Waiting clients: ${pool.waitingCount}`);
    
    // Test a simple query
    console.log('\n🧪 Testing database connectivity...');
    const testResult = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`  ✅ Connection successful`);
    console.log(`  Database: ${testResult.rows[0].db_name}`);
    console.log(`  Server time: ${testResult.rows[0].current_time}`);
    
    // Test a write operation
    console.log('\n🧪 Testing write operation...');
    const testWrite = await pool.query(`
      INSERT INTO ohlcv_1m (ts, symbol, open, high, low, close, volume, trades_count, vwap_minute)
      VALUES (NOW(), 'TESTUSDT', 100, 101, 99, 100.5, 1000, 10, 100.25)
      ON CONFLICT (symbol, ts) DO NOTHING
      RETURNING symbol, ts
    `);
    if (testWrite.rows.length > 0) {
      console.log(`  ✅ Write successful: ${testWrite.rows[0].symbol} at ${testWrite.rows[0].ts}`);
    } else {
      console.log(`  ⚠️  Write returned no rows (likely conflict)`);
    }
    
    // Check for connection errors in pg_stat_database
    const dbStats = await pool.query(`
      SELECT 
        datname,
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as disk_blocks_read,
        blks_hit as cache_blocks_hit,
        temp_files,
        temp_bytes,
        deadlocks,
        conflicts
      FROM pg_stat_database 
      WHERE datname = current_database()
    `);
    
    console.log('\n📊 Database Statistics:');
    const stats = dbStats.rows[0];
    console.log(`  Active connections: ${stats.active_connections}`);
    console.log(`  Transactions committed: ${stats.transactions_committed}`);
    console.log(`  Transactions rolled back: ${stats.transactions_rolled_back}`);
    console.log(`  Deadlocks: ${stats.deadlocks}`);
    console.log(`  Conflicts: ${stats.conflicts}`);
    
    // Summary
    console.log('\n📋 Summary:');
    const totalConnections = parseInt(activeConnections.rows[0].total_connections);
    if (totalConnections >= 5) {
      console.log(`  ⚠️  High connection count (${totalConnections}) - may be approaching pool limit`);
    }
    if (parseInt(activeConnections.rows[0].idle_in_transaction) > 0) {
      console.log(`  ⚠️  Connections idle in transaction - may indicate connection leaks`);
    }
    if (longQueries.rows.length > 0) {
      console.log(`  ⚠️  Long-running queries detected - may cause pool exhaustion`);
    }
    
  } catch (error: any) {
    console.error('❌ Error diagnosing pool:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

diagnosePool();


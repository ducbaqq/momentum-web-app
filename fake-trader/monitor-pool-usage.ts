#!/usr/bin/env tsx
/**
 * Monitor database connection pool usage
 * Usage: tsx fake-trader/monitor-pool-usage.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function monitorPoolUsage() {
  // Connect to any database to check connection stats
  const checkUrl = process.env.DB_BASE_URL 
    ? `${process.env.DB_BASE_URL}/momentum_collector`
    : process.env.DATABASE_URL || 'postgresql://localhost/momentum_collector';
  
  const pool = new Pool({
    connectionString: checkUrl,
    ssl: checkUrl.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
    max: 1,
  });
  
  try {
    const client = await pool.connect();
    
    console.log('📊 Database Connection Usage:\n');
    
    // Check connections per database
    const dbConnections = await client.query(`
      SELECT 
        datname,
        count(*) as connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname IN ('dev', 'staging', 'momentum_collector', 'defaultdb')
      GROUP BY datname
      ORDER BY datname
    `);
    
    console.log('📚 Connections by Database:');
    for (const row of dbConnections.rows) {
      console.log(`  ${row.datname}: ${row.connections} total (${row.active} active, ${row.idle} idle)`);
    }
    
    // Check total connections
    const totalConnections = await client.query(`
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      FROM pg_stat_activity
    `);
    
    const total = totalConnections.rows[0];
    const usagePercent = ((total.total / total.max_connections) * 100).toFixed(1);
    
    console.log(`\n📈 Total Connections: ${total.total} / ${total.max_connections} (${usagePercent}% used)`);
    console.log(`   Active: ${total.active}, Idle: ${total.idle}`);
    
    if (parseInt(total.total) > total.max_connections * 0.8) {
      console.log('\n⚠️  WARNING: Connection usage is above 80%!');
      console.log('   Consider reducing DB_POOL_MAX in your services');
    }
    
    // Check by application name
    const appConnections = await client.query(`
      SELECT 
        COALESCE(application_name, 'unknown') as app_name,
        count(*) as connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle
      FROM pg_stat_activity
      GROUP BY application_name
      ORDER BY connections DESC
      LIMIT 10
    `);
    
    console.log('\n🔌 Connections by Application:');
    for (const row of appConnections.rows) {
      console.log(`  ${row.app_name}: ${row.connections} (${row.active} active, ${row.idle} idle)`);
    }
    
    client.release();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

monitorPoolUsage();


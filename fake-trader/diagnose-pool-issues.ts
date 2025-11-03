// Enhanced pool diagnostics with connection event listeners
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

// Add event listeners to detect pool issues
pool.on('connect', (client) => {
  console.log('✅ New client connected to pool');
});

pool.on('acquire', (client) => {
  console.log('📥 Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('❌ Client removed from pool');
});

pool.on('error', (err, client) => {
  console.error('💥 Pool error:', err.message);
  console.error('   This client has been removed from the pool');
});

async function diagnosePoolIssues() {
  try {
    console.log('🔍 Diagnosing potential pool issues...\n');
    
    // Check for connections that might be stuck
    const stuckConnections = await pool.query(`
      SELECT 
        pid,
        usename,
        application_name,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'idle in transaction'
        AND now() - state_change > interval '30 seconds'
      ORDER BY state_change
    `);
    
    if (stuckConnections.rows.length > 0) {
      console.log('⚠️  Found connections stuck in transaction:');
      for (const row of stuckConnections.rows) {
        const stuckDuration = new Date().getTime() - new Date(row.state_change).getTime();
        console.log(`  PID ${row.pid}: stuck for ${Math.round(stuckDuration/1000)}s`);
        console.log(`    Query: ${row.query_preview}...`);
      }
      console.log('\n💡 These connections are holding locks and preventing pool reuse');
    } else {
      console.log('✅ No stuck connections detected');
    }
    
    // Check for connections from collector
    const collectorConnections = await pool.query(`
      SELECT 
        pid,
        application_name,
        state,
        query_start,
        state_change,
        wait_event_type
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND (
          application_name LIKE '%collector%' 
          OR application_name LIKE '%node%'
          OR application_name IS NULL
        )
      ORDER BY state_change DESC
    `);
    
    console.log(`\n📊 Connections from collector/app: ${collectorConnections.rows.length}`);
    for (const row of collectorConnections.rows.slice(0, 5)) {
      const age = new Date().getTime() - new Date(row.state_change).getTime();
      console.log(`  PID ${row.pid}: ${row.state} (${Math.round(age/1000)}s ago)`);
    }
    
    // Test pool exhaustion scenario
    console.log('\n🧪 Testing pool behavior...');
    const testConnections: any[] = [];
    
    try {
      // Try to acquire more connections than max
      for (let i = 0; i < 8; i++) {
        const client = await pool.connect();
        testConnections.push(client);
        console.log(`  Acquired connection ${i + 1}`);
        
        if (i === 5) {
          console.log('  ⚠️  Pool limit (6) reached - next connection should wait or fail');
        }
      }
    } catch (error: any) {
      console.log(`  ✅ Pool correctly rejected excess connections: ${error.message}`);
    } finally {
      // Release all test connections
      for (const client of testConnections) {
        client.release();
      }
      console.log('  Released all test connections');
    }
    
    // Check pool stats after test
    console.log('\n📊 Pool stats after test:');
    console.log(`  Total: ${pool.totalCount}`);
    console.log(`  Idle: ${pool.idleCount}`);
    console.log(`  Waiting: ${pool.waitingCount}`);
    
    // Summary
    console.log('\n📋 Potential Issues:');
    
    if (stuckConnections.rows.length > 0) {
      console.log('  ❌ Connections stuck in transaction - this can cause pool exhaustion');
      console.log('     Solution: Add timeout to transactions or ensure proper cleanup');
    }
    
    if (pool.totalCount > 5) {
      console.log('  ⚠️  Pool has many connections - may indicate connection leaks');
      console.log('     Solution: Ensure all connections are properly released');
    }
    
    if (pool.waitingCount > 0) {
      console.log('  ⚠️  Clients waiting for connections - pool may be exhausted');
      console.log('     Solution: Increase max pool size or fix connection leaks');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

diagnosePoolIssues();


// Script to stop all active fake trader runs
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/momentum_collector',
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function stopAllActiveRuns() {
  try {
    // First, list all active runs
    const activeRuns = await pool.query(`
      SELECT run_id, name, status, started_at
      FROM ft_runs
      WHERE status IN ('active', 'winding_down')
      ORDER BY started_at DESC
    `);
    
    console.log(`Found ${activeRuns.rows.length} active runs:`);
    for (const run of activeRuns.rows) {
      const name = run.name || 'Unnamed';
      const isTest = name.startsWith('TEST: ');
      const prefix = isTest ? '🧪 ' : '📊 ';
      console.log(`  ${prefix}${run.run_id.substring(0, 8)}... ${name} (${run.status}) - Started: ${run.started_at}`);
    }
    
    if (activeRuns.rows.length === 0) {
      console.log('No active runs to stop.');
      await pool.end();
      return;
    }
    
    // Stop all active runs
    const result = await pool.query(`
      UPDATE ft_runs
      SET status = 'stopped',
          stopped_at = NOW(),
          error = 'Manually stopped'
      WHERE status IN ('active', 'winding_down')
    `);
    
    console.log(`\n✅ Stopped ${result.rowCount} run(s).`);
    
    // Verify
    const remaining = await pool.query(`
      SELECT COUNT(*) as count
      FROM ft_runs
      WHERE status IN ('active', 'winding_down')
    `);
    
    console.log(`\nRemaining active runs: ${remaining.rows[0].count}`);
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

stopAllActiveRuns();


const { Pool } = require('pg');
const fs = require('fs');

function loadEnv() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('=')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
  return envVars;
}

async function checkBacktests() {
  const env = loadEnv();
  const pool = new Pool({ 
    connectionString: env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Get recent backtest runs
    const result = await pool.query(`
      SELECT run_id, name, start_ts, end_ts, symbols, status, created_at
      FROM backtest_runs 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('Recent backtest runs:');
    result.rows.forEach(row => {
      console.log(`${row.run_id}: ${row.name || 'Unnamed'} (${row.status})`);
      console.log(`  Period: ${row.start_ts} to ${row.end_ts}`);
      console.log(`  Symbols: ${JSON.stringify(row.symbols)}`);
      console.log(`  Created: ${row.created_at}\n`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBacktests();
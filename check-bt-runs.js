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

async function checkBtRuns() {
  const env = loadEnv();
  const pool = new Pool({ 
    connectionString: env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Get recent backtest runs
    const result = await pool.query(`
      SELECT run_id, name, start_ts, end_ts, symbols, status, created_at
      FROM bt_runs 
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

    // Test the chart API with the first completed backtest's date range
    const completedRun = result.rows.find(r => r.status === 'done');
    if (completedRun) {
      console.log(`Testing chart API with backtest ${completedRun.run_id} date range...`);
      
      // Convert dates to ISO strings for the API
      const startDate = new Date(completedRun.start_ts).toISOString();
      const endDate = new Date(completedRun.end_ts).toISOString();
      const firstSymbol = completedRun.symbols[0];
      
      console.log(`API call would be: /api/backtest/chart?symbol=${firstSymbol}&tf=15m&start_date=${startDate}&end_date=${endDate}&limit=100`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBtRuns();
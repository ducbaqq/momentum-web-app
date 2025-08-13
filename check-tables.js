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

async function checkTables() {
  const env = loadEnv();
  const pool = new Pool({ 
    connectionString: env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Get all tables
    const result = await pool.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('Available tables:');
    result.rows.forEach(row => {
      console.log(`- ${row.table_name} (${row.table_type})`);
    });
    
    // Check for common table variations
    const variations = ['backtest_runs', 'runs', 'backtests', 'bt_runs'];
    for (const table of variations) {
      try {
        const checkResult = await pool.query(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
        console.log(`\n✅ Table '${table}' exists with ${checkResult.rows[0].count} rows`);
      } catch (e) {
        // Table doesn't exist
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
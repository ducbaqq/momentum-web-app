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

async function checkData() {
  const env = loadEnv();
  const pool = new Pool({ 
    connectionString: env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Check what data is available
    const result = await pool.query(`
      SELECT symbol, MIN(ts) as min_ts, MAX(ts) as max_ts, COUNT(*) as count 
      FROM ohlcv_1m 
      GROUP BY symbol 
      ORDER BY symbol 
      LIMIT 10
    `);
    
    console.log('Available OHLCV data:');
    result.rows.forEach(row => {
      console.log(`${row.symbol}: ${row.count} rows from ${row.min_ts} to ${row.max_ts}`);
    });

    // Test with a specific symbol and date range that should have data
    if (result.rows.length > 0) {
      const firstSymbol = result.rows[0].symbol;
      const startDate = result.rows[0].min_ts;
      const testResult = await pool.query(`
        SELECT COUNT(*) as count, MIN(ts) as min_ts, MAX(ts) as max_ts
        FROM ohlcv_1m 
        WHERE symbol = $1 
        AND ts >= $2::timestamp 
        AND ts <= ($2::timestamp + interval '1 day')
      `, [firstSymbol, startDate]);
      
      console.log(`\nTest query for ${firstSymbol} from ${startDate}:`);
      console.log(JSON.stringify(testResult.rows[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
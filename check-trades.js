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

async function checkTrades() {
  const env = loadEnv();
  const pool = new Pool({ 
    connectionString: env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Check bt_trades table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bt_trades'
      ORDER BY ordinal_position
    `);
    
    console.log('bt_trades table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });

    // Check if there are any trades at all
    const countResult = await pool.query('SELECT COUNT(*) FROM bt_trades');
    console.log(`\nTotal trades in database: ${countResult.rows[0].count}`);

    // Get sample trades from any backtest
    const tradesResult = await pool.query(`
      SELECT *
      FROM bt_trades 
      ORDER BY entry_ts DESC
      LIMIT 5
    `);
    
    // Also check trades for our specific backtest
    const specificResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM bt_trades 
      WHERE run_id = '8622ff57-d91e-4d84-9e77-0bb5677401cd'
    `);
    console.log(`Trades for specific backtest: ${specificResult.rows[0].count}`);
    
    console.log(`\nSample trades for backtest run (${tradesResult.rows.length} trades):`);
    tradesResult.rows.forEach((trade, i) => {
      console.log(`${i+1}. ${JSON.stringify(trade, null, 2)}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTrades();
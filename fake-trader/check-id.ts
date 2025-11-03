import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const id = '0437bfc4-5f5c-4a44-bed1-866f3d65c041';

async function checkId() {
  console.log('Checking as trade_id...');
  const tradeCheck = await pool.query('SELECT trade_id, run_id, symbol, entry_ts FROM ft_trades WHERE trade_id = $1', [id]);
  console.log('Trade check:', tradeCheck.rows.length, 'rows');
  if (tradeCheck.rows.length > 0) {
    console.log('Found trade:', tradeCheck.rows[0]);
  }
  
  console.log('\nChecking as run_id...');
  const runCheck = await pool.query('SELECT run_id, name FROM ft_runs WHERE run_id = $1', [id]);
  console.log('Run check:', runCheck.rows.length, 'rows');
  if (runCheck.rows.length > 0) {
    console.log('Found run:', runCheck.rows[0]);
  }
  
  // Also check if it's a substring match
  console.log('\nChecking partial matches...');
  const partialTrade = await pool.query('SELECT trade_id, run_id, symbol FROM ft_trades WHERE trade_id::text LIKE $1 LIMIT 5', [`%${id.substring(0, 8)}%`]);
  console.log('Partial trade matches:', partialTrade.rows.length);
  partialTrade.rows.forEach(r => console.log('  ', r.trade_id, r.run_id.substring(0, 8), r.symbol));
  
  const partialRun = await pool.query('SELECT run_id, name FROM ft_runs WHERE run_id::text LIKE $1 LIMIT 5', [`%${id.substring(0, 8)}%`]);
  console.log('Partial run matches:', partialRun.rows.length);
  partialRun.rows.forEach(r => console.log('  ', r.run_id, r.name));
  
  await pool.end();
}

checkId().catch(console.error);


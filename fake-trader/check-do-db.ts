import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

const id = '0437bfc4-5f5c-4a44-bed1-866f3d65c041';

async function checkId() {
  console.log('Checking against DigitalOcean database...');
  console.log('Database:', process.env.DATABASE_URL ? 'Using local DATABASE_URL' : 'Using DO database URL');
  
  console.log('\nChecking as trade_id...');
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
  
  // Also check all recent trades
  console.log('\nRecent trades (last 5):');
  const recent = await pool.query('SELECT trade_id, run_id, symbol, side, entry_ts FROM ft_trades ORDER BY entry_ts DESC LIMIT 5');
  recent.rows.forEach(r => {
    console.log(`  ${r.trade_id.substring(0, 8)}... ${r.symbol} ${r.side} ${r.entry_ts}`);
  });
  
  await pool.end();
}

checkId().catch(console.error);

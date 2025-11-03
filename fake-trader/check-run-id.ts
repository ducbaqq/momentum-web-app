import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

const runId = '0437bfc4-5f5c-4a44-bed1-866f3d65c041';

async function checkRun() {
  console.log('Checking run_id:', runId);
  const runCheck = await pool.query('SELECT run_id, name, status, started_at, current_capital, starting_capital FROM ft_runs WHERE run_id = $1', [runId]);
  console.log('Run check:', runCheck.rows.length);
  if (runCheck.rows.length > 0) {
    console.log('Found run:', runCheck.rows[0]);
    const trades = await pool.query('SELECT COUNT(*) as count FROM ft_trades WHERE run_id = $1', [runId]);
    console.log('Trades for this run:', trades.rows[0].count);
    
    const positions = await pool.query('SELECT COUNT(*) as count FROM ft_positions WHERE run_id = $1', [runId]);
    console.log('Positions for this run:', positions.rows[0].count);
  } else {
    console.log('Run not found');
  }
  await pool.end();
}

checkRun().catch(console.error);


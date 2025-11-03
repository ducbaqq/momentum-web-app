import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const id = '0437bfc4-5f5c-4a44-bed1-866f3d65c041';

async function searchAll() {
  console.log('Searching all tables for:', id);
  
  // Check positions
  const pos = await pool.query('SELECT * FROM ft_positions WHERE position_id = $1 OR run_id = $1', [id]);
  console.log(`\nPositions: ${pos.rows.length} rows`);
  if (pos.rows.length > 0) {
    pos.rows.forEach(r => console.log('  ', r.position_id, r.run_id.substring(0, 8), r.symbol, r.side));
  }
  
  // Check signals
  const sig = await pool.query('SELECT * FROM ft_signals WHERE signal_id = $1 OR run_id = $1 LIMIT 5', [id]);
  console.log(`\nSignals: ${sig.rows.length} rows`);
  if (sig.rows.length > 0) {
    sig.rows.forEach(r => console.log('  ', r.signal_id.substring(0, 8), r.run_id.substring(0, 8), r.symbol, r.signal_type));
  }
  
  // Check all trades for any run that might have this ID in name or notes
  const allTrades = await pool.query(`
    SELECT t.*, r.name as run_name
    FROM ft_trades t
    JOIN ft_runs r ON t.run_id = r.run_id
    WHERE t.symbol LIKE '%' OR r.name LIKE '%'
    ORDER BY t.entry_ts DESC
    LIMIT 20
  `);
  console.log(`\nAll recent trades (last 20):`);
  allTrades.rows.forEach(t => {
    console.log(`  Trade: ${t.trade_id.substring(0, 8)}... Run: ${t.run_id.substring(0, 8)}... ${t.symbol} ${t.side} Entry: ${t.entry_ts}`);
  });
  
  await pool.end();
}

searchAll().catch(console.error);


import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function findMultiPositionTrades() {
  // Find runs that have multiple open positions for the same symbol
  const multiPos = await pool.query(`
    SELECT 
      t.run_id,
      t.symbol,
      COUNT(*) as position_count,
      STRING_AGG(DISTINCT t.side, ', ') as sides,
      MIN(t.entry_ts) as first_entry,
      MAX(t.entry_ts) as last_entry,
      r.name as run_name
    FROM ft_trades t
    JOIN ft_runs r ON t.run_id = r.run_id
    WHERE t.status = 'open'
    GROUP BY t.run_id, t.symbol, r.name
    HAVING COUNT(*) > 1
    ORDER BY last_entry DESC
  `);
  
  console.log('Runs with multiple positions for same symbol:');
  multiPos.rows.forEach(r => {
    console.log(`\nRun: ${r.run_id.substring(0, 8)}... (${r.run_name || 'Unnamed'})`);
    console.log(`  Symbol: ${r.symbol}`);
    console.log(`  Positions: ${r.position_count} (${r.sides})`);
    console.log(`  First entry: ${r.first_entry}`);
    console.log(`  Last entry: ${r.last_entry}`);
  });
  
  // Also check for trades around 2AM today (assuming today is Nov 2, 2025)
  const today2am = new Date('2025-11-02T02:00:00Z');
  const today3am = new Date('2025-11-02T03:00:00Z');
  
  console.log('\n\nTrades around 2AM today (Nov 2, 2025):');
  const trades2am = await pool.query(`
    SELECT t.*, r.name as run_name
    FROM ft_trades t
    JOIN ft_runs r ON t.run_id = r.run_id
    WHERE t.entry_ts >= $1 AND t.entry_ts < $2
    ORDER BY t.entry_ts
  `, [today2am.toISOString(), today3am.toISOString()]);
  
  if (trades2am.rows.length === 0) {
    console.log('  No trades found around 2AM today');
    // Try yesterday
    const yesterday2am = new Date('2025-11-01T02:00:00Z');
    const yesterday3am = new Date('2025-11-01T03:00:00Z');
    console.log('\nTrades around 2AM yesterday (Nov 1, 2025):');
    const tradesYesterday = await pool.query(`
      SELECT t.*, r.name as run_name
      FROM ft_trades t
      JOIN ft_runs r ON t.run_id = r.run_id
      WHERE t.entry_ts >= $1 AND t.entry_ts < $2
      ORDER BY t.entry_ts
    `, [yesterday2am.toISOString(), yesterday3am.toISOString()]);
    
    tradesYesterday.rows.forEach(t => {
      console.log(`  Trade: ${t.trade_id} Run: ${t.run_id.substring(0, 8)}... ${t.symbol} ${t.side} Entry: ${t.entry_ts}`);
    });
  } else {
    trades2am.rows.forEach(t => {
      console.log(`  Trade: ${t.trade_id} Run: ${t.run_id.substring(0, 8)}... ${t.symbol} ${t.side} Entry: ${t.entry_ts}`);
    });
  }
  
  await pool.end();
}

findMultiPositionTrades().catch(console.error);


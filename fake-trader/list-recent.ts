import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function listRecentTrades() {
  console.log('Recent trades (last 10):');
  const trades = await pool.query(`
    SELECT trade_id, run_id, symbol, side, entry_ts, exit_ts, status, realized_pnl, unrealized_pnl
    FROM ft_trades
    ORDER BY entry_ts DESC
    LIMIT 10
  `);
  
  trades.rows.forEach((t, i) => {
    console.log(`\n${i + 1}. Trade ID: ${t.trade_id}`);
    console.log(`   Run ID: ${t.run_id}`);
    console.log(`   Symbol: ${t.symbol}, Side: ${t.side}`);
    console.log(`   Entry: ${t.entry_ts}, Exit: ${t.exit_ts || 'OPEN'}`);
    console.log(`   Status: ${t.status}, PnL: ${t.realized_pnl || t.unrealized_pnl || 0}`);
  });
  
  console.log('\n\nRecent runs (last 10):');
  const runs = await pool.query(`
    SELECT run_id, name, status, started_at, current_capital, starting_capital
    FROM ft_runs
    ORDER BY started_at DESC
    LIMIT 10
  `);
  
  runs.rows.forEach((r, i) => {
    console.log(`\n${i + 1}. Run ID: ${r.run_id}`);
    console.log(`   Name: ${r.name || 'Unnamed'}`);
    console.log(`   Status: ${r.status}, Started: ${r.started_at}`);
    console.log(`   Capital: $${r.current_capital} / $${r.starting_capital}`);
  });
  
  await pool.end();
}

listRecentTrades().catch(console.error);


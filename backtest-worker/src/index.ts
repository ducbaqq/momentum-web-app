import 'dotenv/config';
import { pool, claimNextRun, setRunDone, setRunError } from './db.js';
import { runOneSymbol } from './engine.js';

const POLL_MS = Number(process.env.POLL_MS || 1500);
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL_SYMBOLS || 2);

async function processOne() {
  const run = await claimNextRun(process.env.WORKER_NAME || 'worker');
  if (!run) return false;

  try {
    console.log(`=== Processing backtest run ${run.run_id} ===`);
    console.log(`Strategy: ${run.strategy_name} v${run.strategy_version}`);
    console.log(`Symbols: ${run.symbols.join(', ')} (${run.symbols.length} total)`);
    console.log(`Period: ${run.start_ts} to ${run.end_ts}`);
    console.log(`Parameters:`, JSON.stringify(run.params, null, 2));
    
    const startTime = Date.now();
    
    // simple serial per run; symbols pipelined up to MAX_PARALLEL if needed
    const chunks: string[][] = [];
    for (let i=0; i<run.symbols.length; i+=MAX_PARALLEL) {
      chunks.push(run.symbols.slice(i, i+MAX_PARALLEL));
    }
    
    let completedSymbols = 0;
    for (const chunk of chunks) {
      console.log(`Processing chunk: ${chunk.join(', ')}`);
      await Promise.all(chunk.map(async sym => {
        try {
          await runOneSymbol(run, sym);
          completedSymbols++;
          console.log(`✓ Completed ${sym} (${completedSymbols}/${run.symbols.length})`);
        } catch (symError: any) {
          console.error(`✗ Failed ${sym}:`, symError.message);
          throw symError; // Re-throw to fail the whole run
        }
      }));
    }
    
    const duration = (Date.now() - startTime) / 1000;
    await setRunDone(run.run_id);
    console.log(`🎉 Successfully completed backtest run ${run.run_id} in ${duration.toFixed(1)}s`);
  } catch (e: any) {
    console.error(`Backtest run ${run.run_id} failed:`, e);
    
    // Provide more detailed error information
    let errorMessage = e?.message || String(e);
    if (e?.code) {
      errorMessage = `Database Error ${e.code}: ${errorMessage}`;
    }
    if (e?.detail) {
      errorMessage += ` (Detail: ${e.detail})`;
    }
    if (e?.hint) {
      errorMessage += ` (Hint: ${e.hint})`;
    }
    
    console.error(`Storing error for run ${run.run_id}: ${errorMessage}`);
    await setRunError(run.run_id, errorMessage);
  }
  return true;
}

async function loop() {
  console.log('🚀 Starting backtest worker...');
  console.log(`Configuration:`);
  console.log(`  - Worker Name: ${process.env.WORKER_NAME || 'worker'}`);
  console.log(`  - Poll Interval: ${POLL_MS}ms`);
  console.log(`  - Max Parallel Symbols: ${MAX_PARALLEL}`);
  console.log(`  - Database URL: ${process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
  
  // Test database connection
  try {
    const testResult = await pool.query('SELECT NOW() as current_time');
    console.log(`✓ Database connected successfully at ${testResult.rows[0].current_time}`);
  } catch (dbError: any) {
    console.error('✗ Database connection failed:', dbError.message);
    process.exit(1);
  }
  
  console.log('👀 Polling for backtest jobs...\n');
  
  while (true) {
    try {
      const worked = await processOne();
      if (!worked) {
        // Only log when we first start waiting, not on every poll
        if (!process.env.QUIET_POLLING) {
          console.log(`⏰ No jobs available, waiting ${POLL_MS}ms...`);
          process.env.QUIET_POLLING = 'true'; // Set flag to avoid spam
        }
        await new Promise(r => setTimeout(r, POLL_MS));
      } else {
        // Reset the quiet polling flag when we do work
        delete process.env.QUIET_POLLING;
      }
    } catch (error: any) {
      console.error('Error in main loop:', error);
      await new Promise(r => setTimeout(r, POLL_MS * 2)); // Wait longer on error
    }
  }
}

loop().catch(async (e) => {
  console.error('💥 Worker fatal error:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
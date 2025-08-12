import pg from 'pg';
import type { RunRow, Candle } from './types.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

export async function claimNextRun(workerName: string) {
  // Atomically claim the oldest queued job
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(
      `SELECT run_id FROM bt_runs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    if (!q.rowCount) { await client.query('COMMIT'); return null; }
    const run_id = q.rows[0].run_id as string;

    await client.query(
      `UPDATE bt_runs SET status='running' WHERE run_id=$1`,
      [run_id]
    );
    await client.query('COMMIT');
    const run = await getRun(run_id);
    return run;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getRun(run_id: string): Promise<RunRow> {
  const q = await pool.query(`SELECT * FROM bt_runs WHERE run_id=$1`, [run_id]);
  return q.rows[0];
}

export async function setRunError(run_id: string, err: string) {
  // Truncate error message if too long for database storage
  const maxErrorLength = 1000;
  const truncatedError = err.length > maxErrorLength ? err.substring(0, maxErrorLength) + '...' : err;
  
  console.error(`Setting run ${run_id} to error status: ${truncatedError}`);
  await pool.query(`UPDATE bt_runs SET status='error', error=$2 WHERE run_id=$1`, [run_id, truncatedError]);
}

export async function setRunDone(run_id: string) {
  await pool.query(`UPDATE bt_runs SET status='done', error=NULL WHERE run_id=$1`, [run_id]);
}

export async function writeResults(run_id: string, symbol: string, result: any) {
  const s = result.summary;
  await pool.query(
    `INSERT INTO bt_results
     (run_id, symbol, trades, wins, losses, pnl, fees, win_rate, sharpe, sortino, max_dd, profit_factor, exposure, turnover)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (run_id, symbol) DO UPDATE SET
       trades=EXCLUDED.trades, wins=EXCLUDED.wins, losses=EXCLUDED.losses, pnl=EXCLUDED.pnl,
       fees=EXCLUDED.fees, win_rate=EXCLUDED.win_rate, sharpe=EXCLUDED.sharpe,
       sortino=EXCLUDED.sortino, max_dd=EXCLUDED.max_dd, profit_factor=EXCLUDED.profit_factor,
       exposure=EXCLUDED.exposure, turnover=EXCLUDED.turnover`,
    [run_id, symbol, s.trades, s.wins, s.losses, s.pnl, s.fees, s.winRate, s.sharpe, s.sortino, s.maxDd, s.profitFactor, s.exposure, s.turnover]
  );

  if (result.equityCurve?.length) {
    const vals = result.equityCurve.flatMap((p: any) => [run_id, symbol, p.ts, p.equity]);
    const ph = result.equityCurve.map((_: any, i: number)=>`($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',');
    await pool.query(
      `INSERT INTO bt_equity (run_id, symbol, ts, equity) VALUES ${ph}
       ON CONFLICT (run_id, symbol, ts) DO UPDATE SET equity=EXCLUDED.equity`,
      vals
    );
  }

  // optional: write trades too
}

export async function loadCandlesWithFeatures(symbol: string, start: string, end: string): Promise<Candle[]> {
  try {
    const q = await pool.query(
          `SELECT
       o.ts,
       o.open, o.high, o.low, o.close, o.volume, o.trades_count, o.vwap_minute,
       f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
       f.rsi_14, f.ema_12, f.ema_20, f.ema_26, f.ema_50, f.macd, f.macd_signal,
       f.bb_upper, f.bb_lower, f.bb_basis, f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
     FROM ohlcv_1m o
     LEFT JOIN features_1m f ON f.symbol=o.symbol AND f.ts=o.ts
     WHERE o.symbol=$1 AND o.ts >= $2 AND o.ts <= $3
     ORDER BY o.ts ASC`,
      [symbol, start, end]
    );
    
    if (q.rows.length === 0) {
      throw new Error(`No OHLCV data found for ${symbol} between ${start} and ${end}`);
    }
    
    return q.rows.map(r => ({
      ts: r.ts,
      open: Number(r.open), 
      high: Number(r.high), 
      low: Number(r.low),
      close: Number(r.close), 
      volume: Number(r.volume),
      trades_count: r.trades_count ? Number(r.trades_count) : null,
      vwap_minute: r.vwap_minute ? Number(r.vwap_minute) : null,
      roc_1m: r.roc_1m, 
      roc_5m: r.roc_5m, 
      roc_15m: r.roc_15m, 
      roc_30m: r.roc_30m, 
      roc_1h: r.roc_1h, 
      roc_4h: r.roc_4h,
      rsi_14: r.rsi_14, 
      ema_12: r.ema_12,
      ema_20: r.ema_20,
      ema_26: r.ema_26, 
      ema_50: r.ema_50, 
      macd: r.macd, 
      macd_signal: r.macd_signal,
      bb_upper: r.bb_upper, 
      bb_lower: r.bb_lower, 
      bb_basis: r.bb_basis,
      vol_avg_20: r.vol_avg_20, 
      vol_mult: r.vol_mult,
      book_imb: r.book_imb, 
      spread_bps: r.spread_bps
    }));
  } catch (error) {
    console.error(`Error loading candles for ${symbol}:`, error);
    throw new Error(`Failed to load candles for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface DataQualityReport {
  symbol: string;
  period: { start: string; end: string };
  ohlcvCount: number;
  featuresCount: number;
  missingFeatures: number;
  dataGaps: string[];
  qualityScore: number; // 0-1, where 1 is perfect
  warnings: string[];
}

export async function validateDataQuality(symbol: string, start: string, end: string): Promise<DataQualityReport> {
  try {
    // Check OHLCV data completeness
    const ohlcvQuery = await pool.query(
      `SELECT COUNT(*) as count, MIN(ts) as first_ts, MAX(ts) as last_ts
       FROM ohlcv_1m 
       WHERE symbol=$1 AND ts >= $2 AND ts <= $3`,
      [symbol, start, end]
    );
    
    // Check features data completeness
    const featuresQuery = await pool.query(
      `SELECT COUNT(*) as count
       FROM features_1m 
       WHERE symbol=$1 AND ts >= $2 AND ts <= $3 AND roc_1m IS NOT NULL`,
      [symbol, start, end]
    );
    
    // Check for gaps in data (missing minutes)
    const gapsQuery = await pool.query(
      `WITH expected_times AS (
         SELECT generate_series($2::timestamp, $3::timestamp, '1 minute'::interval) as expected_ts
       )
       SELECT et.expected_ts
       FROM expected_times et
       LEFT JOIN ohlcv_1m o ON o.ts = et.expected_ts AND o.symbol = $1
       WHERE o.ts IS NULL
       ORDER BY et.expected_ts
       LIMIT 10`, // Limit to first 10 gaps for performance
      [symbol, start, end]
    );
    
    const ohlcvCount = Number(ohlcvQuery.rows[0].count);
    const featuresCount = Number(featuresQuery.rows[0].count);
    const missingFeatures = ohlcvCount - featuresCount;
    const dataGaps = gapsQuery.rows.map(r => r.expected_ts);
    
    // Calculate expected data points (1-minute intervals)
    const startTime = new Date(start);
    const endTime = new Date(end);
    const expectedMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (60 * 1000));
    
    // Calculate quality score
    const completenessScore = ohlcvCount / Math.max(expectedMinutes, 1);
    const featuresScore = featuresCount / Math.max(ohlcvCount, 1);
    const qualityScore = Math.min(1, (completenessScore + featuresScore) / 2);
    
    // Generate warnings
    const warnings: string[] = [];
    if (completenessScore < 0.95) {
      warnings.push(`OHLCV data completeness: ${(completenessScore * 100).toFixed(1)}% (${ohlcvCount}/${expectedMinutes} minutes)`);
    }
    if (featuresScore < 0.80) {
      warnings.push(`Features completeness: ${(featuresScore * 100).toFixed(1)}% (${featuresCount}/${ohlcvCount} candles with features)`);
    }
    if (dataGaps.length > 0) {
      warnings.push(`${dataGaps.length}+ data gaps detected (first gap: ${dataGaps[0]})`);
    }
    
    return {
      symbol,
      period: { start, end },
      ohlcvCount,
      featuresCount,
      missingFeatures,
      dataGaps,
      qualityScore,
      warnings
    };
  } catch (error) {
    console.error(`Error validating data quality for ${symbol}:`, error);
    throw new Error(`Failed to validate data quality: ${error instanceof Error ? error.message : String(error)}`);
  }
}
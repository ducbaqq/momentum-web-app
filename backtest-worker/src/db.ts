import pg from 'pg';
import type { RunRow, Candle } from './types.js';
import { getTimeframeMinutes } from './utils.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

export async function logExecutionStep(executionLog: {
  run_id: string;
  symbol: string;
  bar_index: number;
  ts: string;
  candle_data: any;
  strategy_signals: any[];
  filtered_signals: any[];
  pending_signals: any[];
  executed_signals: any[];
  positions_before: any[];
  positions_after: any[];
  account_balance: number;
  total_equity: number;
  unrealized_pnl: number;
  execution_price?: number;
  slippage_amount?: number;
  commission_paid?: number;
  funding_paid?: number;
  strategy_state: any;
  rejection_reasons?: string[];
  execution_notes?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO bt_execution_logs 
       (run_id, symbol, bar_index, ts, candle_data, strategy_signals, filtered_signals, 
        pending_signals, executed_signals, positions_before, positions_after, 
        account_balance, total_equity, unrealized_pnl, execution_price, slippage_amount,
        commission_paid, funding_paid, strategy_state, rejection_reasons, execution_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       ON CONFLICT (run_id, symbol, bar_index) DO UPDATE SET
         candle_data = EXCLUDED.candle_data,
         strategy_signals = EXCLUDED.strategy_signals,
         filtered_signals = EXCLUDED.filtered_signals,
         pending_signals = EXCLUDED.pending_signals,
         executed_signals = EXCLUDED.executed_signals,
         positions_after = EXCLUDED.positions_after,
         total_equity = EXCLUDED.total_equity,
         unrealized_pnl = EXCLUDED.unrealized_pnl,
         execution_price = EXCLUDED.execution_price,
         slippage_amount = EXCLUDED.slippage_amount,
         commission_paid = EXCLUDED.commission_paid,
         funding_paid = EXCLUDED.funding_paid,
         strategy_state = EXCLUDED.strategy_state,
         rejection_reasons = EXCLUDED.rejection_reasons,
         execution_notes = EXCLUDED.execution_notes`,
      [
        executionLog.run_id,
        executionLog.symbol,
        executionLog.bar_index,
        executionLog.ts,
        JSON.stringify(executionLog.candle_data),
        JSON.stringify(executionLog.strategy_signals),
        JSON.stringify(executionLog.filtered_signals),
        JSON.stringify(executionLog.pending_signals),
        JSON.stringify(executionLog.executed_signals),
        JSON.stringify(executionLog.positions_before),
        JSON.stringify(executionLog.positions_after),
        executionLog.account_balance,
        executionLog.total_equity,
        executionLog.unrealized_pnl,
        executionLog.execution_price || null,
        executionLog.slippage_amount || null,
        executionLog.commission_paid || null,
        executionLog.funding_paid || null,
        JSON.stringify(executionLog.strategy_state),
        executionLog.rejection_reasons ? JSON.stringify(executionLog.rejection_reasons) : null,
        executionLog.execution_notes || null
      ]
    );
  } catch (error: any) {
    console.error(`Failed to log execution step for ${executionLog.symbol} bar ${executionLog.bar_index}:`, error.message);
  }
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

  // Write individual trades to bt_trades table
  if (result.trades?.length) {
    console.log(`Writing ${result.trades.length} trades for ${symbol}`);
    
    for (const trade of result.trades) {
      try {
        await pool.query(
          `INSERT INTO bt_trades 
           (run_id, symbol, entry_ts, exit_ts, side, qty, entry_px, exit_px, pnl, fees, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (run_id, symbol, entry_ts) DO UPDATE SET
             exit_ts=EXCLUDED.exit_ts, exit_px=EXCLUDED.exit_px, pnl=EXCLUDED.pnl, fees=EXCLUDED.fees`,
          [
            run_id,
            symbol,
            trade.entryTs,
            trade.exitTs || null,
            trade.side.toLowerCase(),
            trade.qty,
            trade.entryPx,
            trade.exitPx || null,
            trade.pnl,
            trade.fees,
            trade.reason || 'unknown'
          ]
        );
      } catch (err: any) {
        console.error(`Failed to insert trade:`, err.message);
        console.error('Trade data:', trade);
      }
    }
  }
}

// Helper function to process database rows into Candle objects
function processRow(r: any): Candle {
  return {
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
  };
}

export async function loadCandlesWithFeatures(symbol: string, start: string, end: string, timeframe: string = '1m'): Promise<Candle[]> {
  try {
    // If timeframe is 1m, use the original simple query
    if (timeframe === '1m') {
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
      return q.rows.map(processRow);
    }

    // For higher timeframes, aggregate using the same approach as download-candles API
    const timeframeMinutes = getTimeframeMinutes(timeframe as any);
    const q = await pool.query(
      `WITH base AS (
        SELECT
          o.ts,
          o.open::double precision AS open, o.high::double precision AS high,
          o.low::double precision AS low, o.close::double precision AS close,
          o.volume::double precision AS volume, o.trades_count, o.vwap_minute,
          f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
          f.rsi_14, f.ema_12, f.ema_20, f.ema_26, f.ema_50, f.macd, f.macd_signal,
          f.bb_upper, f.bb_lower, f.bb_basis, f.vol_avg_20, f.vol_mult, f.book_imb, f.spread_bps
        FROM ohlcv_1m o
        LEFT JOIN features_1m f ON f.symbol=o.symbol AND f.ts=o.ts
        WHERE o.symbol=$1 AND o.ts >= $2::timestamp AND o.ts <= $3::timestamp
      ),
      buckets AS (
        SELECT *,
          to_timestamp(floor(extract(epoch from ts) / ($4::int*60)) * ($4::int*60)) AT TIME ZONE 'UTC' AS bucket
        FROM base
      ),
      agg AS (
        SELECT
          bucket AS ts,
          (ARRAY_AGG(open ORDER BY ts))[1] AS open,
          MAX(high) AS high,
          MIN(low) AS low,
          (ARRAY_AGG(close ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(close), 1)] AS close,
          SUM(volume) AS volume,
          SUM(trades_count) AS trades_count,
          (ARRAY_AGG(vwap_minute ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vwap_minute), 1)] AS vwap_minute,
          -- For technical indicators, use values from the last candle in the bucket
          (ARRAY_AGG(roc_1m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_1m), 1)] AS roc_1m,
          (ARRAY_AGG(roc_5m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_5m), 1)] AS roc_5m,
          (ARRAY_AGG(roc_15m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_15m), 1)] AS roc_15m,
          (ARRAY_AGG(roc_30m ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_30m), 1)] AS roc_30m,
          (ARRAY_AGG(roc_1h ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_1h), 1)] AS roc_1h,
          (ARRAY_AGG(roc_4h ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(roc_4h), 1)] AS roc_4h,
          (ARRAY_AGG(rsi_14 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(rsi_14), 1)] AS rsi_14,
          (ARRAY_AGG(ema_12 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_12), 1)] AS ema_12,
          (ARRAY_AGG(ema_20 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_20), 1)] AS ema_20,
          (ARRAY_AGG(ema_26 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_26), 1)] AS ema_26,
          (ARRAY_AGG(ema_50 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(ema_50), 1)] AS ema_50,
          (ARRAY_AGG(macd ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(macd), 1)] AS macd,
          (ARRAY_AGG(macd_signal ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(macd_signal), 1)] AS macd_signal,
          (ARRAY_AGG(bb_upper ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_upper), 1)] AS bb_upper,
          (ARRAY_AGG(bb_lower ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_lower), 1)] AS bb_lower,
          (ARRAY_AGG(bb_basis ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(bb_basis), 1)] AS bb_basis,
          (ARRAY_AGG(vol_avg_20 ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vol_avg_20), 1)] AS vol_avg_20,
          (ARRAY_AGG(vol_mult ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(vol_mult), 1)] AS vol_mult,
          (ARRAY_AGG(book_imb ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(book_imb), 1)] AS book_imb,
          (ARRAY_AGG(spread_bps ORDER BY ts))[ARRAY_LENGTH(ARRAY_AGG(spread_bps), 1)] AS spread_bps
        FROM buckets
        GROUP BY bucket
        HAVING COUNT(*) > 0
      )
      SELECT * FROM agg ORDER BY ts ASC`,
      [symbol, start, end, timeframeMinutes]
    );
    if (q.rows.length === 0) {
      throw new Error(`No OHLCV data found for ${symbol} between ${start} and ${end}`);
    }

    return q.rows.map(processRow);
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
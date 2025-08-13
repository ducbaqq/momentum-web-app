import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    // Fetch run details
    const runQuery = `
      SELECT 
        run_id, name, start_ts, end_ts, symbols, timeframe,
        strategy_name, strategy_version, params, seed, status,
        created_at
      FROM bt_runs 
      WHERE run_id = $1
    `;
    const runResult = await pool.query(runQuery, [runId]);
    
    if (runResult.rows.length === 0) {
      return NextResponse.json({ error: 'Backtest run not found' }, { status: 404 });
    }

    const run = runResult.rows[0];

    // Fetch results and trades
    const resultsQuery = `
      SELECT 
        symbol, trades, wins, losses, pnl, fees, win_rate, sharpe, sortino,
        max_dd, profit_factor, exposure, turnover
      FROM bt_results 
      WHERE run_id = $1
    `;
    const resultsResult = await pool.query(resultsQuery, [runId]);

    // Fetch individual trades
    const tradesQuery = `
      SELECT 
        symbol, entry_ts, exit_ts, side, qty, entry_px, exit_px, 
        pnl, fees, reason
      FROM bt_trades 
      WHERE run_id = $1
      ORDER BY entry_ts
    `;
    const tradesResult = await pool.query(tradesQuery, [runId]);

    // Fetch equity curve data if available
    const equityQuery = `
      SELECT 
        symbol, ts, equity
      FROM bt_equity 
      WHERE run_id = $1
      ORDER BY ts
    `;
    const equityResult = await pool.query(equityQuery, [runId]);

    // Fetch detailed execution logs (the exact backtest decisions)
    const executionLogsQuery = `
      SELECT 
        symbol, bar_index, ts, candle_data, strategy_signals, filtered_signals,
        pending_signals, executed_signals, positions_before, positions_after,
        account_balance, total_equity, unrealized_pnl, execution_price,
        slippage_amount, commission_paid, funding_paid, strategy_state,
        rejection_reasons, execution_notes
      FROM bt_execution_logs 
      WHERE run_id = $1
      ORDER BY symbol, bar_index
    `;
    const executionLogsResult = await pool.query(executionLogsQuery, [runId]);

    // Parse run data - handle symbols which might be a string or JSON array
    let symbols: string[] = [];
    if (Array.isArray(run.symbols)) {
      symbols = run.symbols;
    } else if (typeof run.symbols === 'string') {
      try {
        symbols = JSON.parse(run.symbols);
      } catch {
        // If not JSON, treat as comma-separated string
        symbols = run.symbols.split(',').map(s => s.trim()).filter(s => s);
      }
    }

    let parsedParams: any = {};
    try {
      parsedParams = JSON.parse(run.params as string || '{}');
    } catch {
      parsedParams = {};
    }

    const runData = {
      run_id: run.run_id,
      name: run.name,
      start_ts: run.start_ts,
      end_ts: run.end_ts,
      symbols: symbols,
      timeframe: run.timeframe,
      strategy_name: run.strategy_name,
      strategy_version: run.strategy_version,
      params: parsedParams,
      seed: run.seed,
      status: run.status,
      created_at: run.created_at
    };

    // Calculate comprehensive metrics
    const results = resultsResult.rows.map(row => ({
      symbol: row.symbol,
      trades: Number(row.trades || 0),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      pnl: Number(row.pnl || 0),
      fees: Number(row.fees || 0),
      win_rate: Number(row.win_rate || 0),
      sharpe: Number(row.sharpe || 0),
      sortino: Number(row.sortino || 0),
      max_dd: Number(row.max_dd || 0),
      profit_factor: Number(row.profit_factor || 0),
      exposure: Number(row.exposure || 0),
      turnover: Number(row.turnover || 0)
    }));

    const trades = tradesResult.rows.map(row => ({
      symbol: row.symbol,
      entry_ts: row.entry_ts,
      exit_ts: row.exit_ts,
      side: row.side,
      qty: Number(row.qty || 0),
      entry_px: Number(row.entry_px || 0),
      exit_px: Number(row.exit_px || 0),
      pnl: Number(row.pnl || 0),
      fees: Number(row.fees || 0),
      reason: row.reason
    }));

    const equityCurve = equityResult.rows.map(row => ({
      symbol: row.symbol,
      ts: row.ts,
      equity: Number(row.equity || 0)
    }));

    // Parse detailed execution logs (the EXACT backtest decisions)
    const executionLogs = executionLogsResult.rows.map(row => ({
      symbol: row.symbol,
      bar_index: Number(row.bar_index),
      ts: row.ts,
      candle_data: JSON.parse(row.candle_data || '{}'),
      strategy_signals: JSON.parse(row.strategy_signals || '[]'),
      filtered_signals: JSON.parse(row.filtered_signals || '[]'),
      pending_signals: JSON.parse(row.pending_signals || '[]'),
      executed_signals: JSON.parse(row.executed_signals || '[]'),
      positions_before: JSON.parse(row.positions_before || '[]'),
      positions_after: JSON.parse(row.positions_after || '[]'),
      account_balance: Number(row.account_balance || 0),
      total_equity: Number(row.total_equity || 0),
      unrealized_pnl: Number(row.unrealized_pnl || 0),
      execution_price: row.execution_price ? Number(row.execution_price) : null,
      slippage_amount: row.slippage_amount ? Number(row.slippage_amount) : null,
      commission_paid: row.commission_paid ? Number(row.commission_paid) : null,
      funding_paid: row.funding_paid ? Number(row.funding_paid) : null,
      strategy_state: JSON.parse(row.strategy_state || '{}'),
      rejection_reasons: row.rejection_reasons ? JSON.parse(row.rejection_reasons) : null,
      execution_notes: row.execution_notes
    }));

    // Calculate aggregated metrics  
    const startingCapital = runData.params?.starting_capital || 10000;
    const totalPnL = results.reduce((sum, r) => sum + r.pnl, 0);
    const totalFees = results.reduce((sum, r) => sum + r.fees, 0);
    const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
    const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
    const totalLosses = results.reduce((sum, r) => sum + r.losses, 0);
    
    // Time calculations
    const startDate = new Date(runData.start_ts);
    const endDate = new Date(runData.end_ts);
    const durationDays = Math.max((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24), 0.01);
    const durationYears = durationDays / 365.25;
    
    // Performance calculations
    const totalReturn = totalPnL / startingCapital;
    const annualizedReturn = durationYears > 0 ? Math.pow(1 + totalReturn, 1 / durationYears) - 1 : 0;
    const avgWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgSharpe = results.filter(r => isFinite(r.sharpe)).reduce((sum, r) => sum + r.sharpe, 0) / Math.max(results.filter(r => isFinite(r.sharpe)).length, 1);
    const avgSortino = results.filter(r => isFinite(r.sortino)).reduce((sum, r) => sum + r.sortino, 0) / Math.max(results.filter(r => isFinite(r.sortino)).length, 1);
    const maxDrawdown = Math.max(...results.map(r => Math.abs(r.max_dd)));

    // Build comprehensive export data
    const exportData = {
      metadata: {
        export_timestamp: new Date().toISOString(),
        export_version: '1.0.0',
        run_id: runId
      },
      
      // 1. All BT run parameters
      run_parameters: runData,
      
      // 2. All processed data summary
      data_processed: {
        symbols: runData.symbols,
        timeframe: runData.timeframe,
        start_date: runData.start_ts,
        end_date: runData.end_ts,
        duration_days: Math.round(durationDays * 100) / 100,
        total_data_points: equityCurve.length,
        strategy_config: runData.params
      },

      // 3. All executions (trade history)
      trade_history: {
        total_trades: totalTrades,
        trades_by_symbol: results.map(r => ({
          symbol: r.symbol,
          trade_count: r.trades,
          win_count: r.wins,
          loss_count: r.losses
        })),
        individual_trades: trades
      },

      // 4. Capital summaries
      capital_summary: {
        starting_capital: startingCapital,
        ending_capital: startingCapital + totalPnL,
        net_pnl: totalPnL,
        total_fees: totalFees,
        net_after_fees: totalPnL - totalFees,
        total_return: totalReturn,
        total_return_percent: totalReturn * 100,
        annualized_return: annualizedReturn,
        annualized_return_percent: annualizedReturn * 100
      },

      // 5. Performance metrics
      performance_metrics: {
        total_return_percent: totalReturn * 100,
        annualized_return_percent: annualizedReturn * 100,
        win_rate_percent: avgWinRate,
        profit_factor: results.reduce((sum, r) => sum + r.profit_factor, 0) / Math.max(results.length, 1),
        sharpe_ratio: avgSharpe,
        sortino_ratio: avgSortino,
        expectancy: totalTrades > 0 ? totalPnL / totalTrades : 0,
        average_trade_return: totalTrades > 0 ? totalPnL / totalTrades : 0
      },

      // 6. Risk metrics
      risk_metrics: {
        max_drawdown_percent: maxDrawdown,
        max_drawdown_amount: (maxDrawdown / 100) * startingCapital,
        volatility: 0, // Would need daily returns to calculate
        var_95: 0, // Would need returns distribution
        best_trade: trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0,
        worst_trade: trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0,
        largest_winning_streak: 0, // Would need to calculate from trade sequence
        largest_losing_streak: 0 // Would need to calculate from trade sequence
      },

      // 7. Trade statistics
      trade_statistics: {
        total_trades: totalTrades,
        winning_trades: totalWins,
        losing_trades: totalLosses,
        win_rate_percent: avgWinRate,
        average_win: totalWins > 0 ? trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / totalWins : 0,
        average_loss: totalLosses > 0 ? Math.abs(trades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0)) / totalLosses : 0,
        largest_win: trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0,
        largest_loss: trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0,
        average_trade_duration: 0, // Would need to calculate from entry/exit times
        trades_per_symbol: results.map(r => ({ symbol: r.symbol, count: r.trades }))
      },

      // 8. Detailed results by symbol
      results_by_symbol: results,

      // 9. Equity curve data
      equity_curve: equityCurve,

      // 10. Raw execution data for analysis
      raw_data: {
        all_trades: trades,
        symbol_performance: results,
        execution_summary: {
          total_commission: totalFees,
          total_slippage: 0, // Would track if available
          execution_quality: "Standard", // Could add execution quality metrics
          funding_costs: 0
        }
      },

      // 11. DETAILED EXECUTION LOGS - EXACT BACKTEST DECISIONS
      execution_logs: {
        total_bars_processed: executionLogs.length,
        logs_by_symbol: executionLogs.reduce((acc, log) => {
          if (!acc[log.symbol]) acc[log.symbol] = [];
          acc[log.symbol].push(log);
          return acc;
        }, {} as Record<string, any[]>),
        
        // Summary of decision patterns
        decision_summary: {
          total_strategy_signals: executionLogs.reduce((sum, log) => sum + log.strategy_signals.length, 0),
          total_filtered_signals: executionLogs.reduce((sum, log) => sum + log.filtered_signals.length, 0),
          total_executed_signals: executionLogs.reduce((sum, log) => sum + log.executed_signals.length, 0),
          rejection_rate: executionLogs.length > 0 ? 
            1 - (executionLogs.reduce((sum, log) => sum + log.filtered_signals.length, 0) / 
                 Math.max(executionLogs.reduce((sum, log) => sum + log.strategy_signals.length, 0), 1)) : 0,
          common_rejection_reasons: executionLogs
            .flatMap(log => log.rejection_reasons || [])
            .reduce((acc, reason) => {
              acc[reason] = (acc[reason] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
        },
        
        // Complete step-by-step execution log
        detailed_steps: executionLogs
      }
    };

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '');
    const strategyName = runData.strategy_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `backtest_${strategyName}_${runId}_${timestamp}.json`;

    // Return JSON file download
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export backtest data', details: error.message },
      { status: 500 }
    );
  }
}
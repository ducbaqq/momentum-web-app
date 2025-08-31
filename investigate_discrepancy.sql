-- Investigation Script: Backtest vs Fake Trader Discrepancy
-- Backtest ID: 06f19c3d-ac77-4fed-abb9-89643a7057fa (ending capital: $1,096)
-- Fake trader ID: f8068a5f-0b94-46d2-9385-5fa96e56bdc0 (no capital change, no trades)
-- Both runs trading SOLUSDT with momentum_breakout_v2 strategy

-- =======================
-- 1. RUN PARAMETERS COMPARISON
-- =======================

\echo '=== 1. BACKTEST RUN PARAMETERS ==='
SELECT 
    run_id,
    name,
    start_ts,
    end_ts,
    symbols,
    timeframe,
    strategy_name,
    strategy_version,
    params,
    seed,
    status,
    created_at,
    error
FROM bt_runs 
WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa';

\echo '=== 1. FAKE TRADER RUN PARAMETERS ==='
SELECT 
    run_id,
    name,
    symbols,
    timeframe,
    strategy_name,
    strategy_version,
    params,
    seed,
    status,
    starting_capital,
    current_capital,
    max_concurrent_positions,
    started_at,
    last_update,
    stopped_at,
    error,
    created_at
FROM ft_runs 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0';

-- =======================
-- 2. RESULTS COMPARISON
-- =======================

\echo '=== 2. BACKTEST RESULTS ==='
SELECT 
    run_id,
    symbol,
    trades,
    wins,
    losses,
    pnl,
    fees,
    win_rate,
    sharpe,
    sortino,
    max_dd,
    profit_factor,
    exposure,
    turnover
FROM bt_results 
WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa';

\echo '=== 2. FAKE TRADER RESULTS ==='
SELECT 
    run_id,
    symbol,
    trades,
    wins,
    losses,
    realized_pnl,
    unrealized_pnl,
    total_pnl,
    fees,
    win_rate,
    sharpe,
    sortino,
    max_dd,
    profit_factor,
    exposure,
    turnover,
    first_trade_at,
    last_trade_at,
    last_update
FROM ft_results 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0';

-- =======================
-- 3. BACKTEST TRADES ANALYSIS
-- =======================

\echo '=== 3. BACKTEST TRADES DETAIL ==='
SELECT 
    run_id,
    symbol,
    entry_ts,
    exit_ts,
    side,
    qty,
    entry_px,
    exit_px,
    pnl,
    fees,
    reason,
    created_at
FROM bt_trades 
WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'
ORDER BY entry_ts;

\echo '=== 3. FAKE TRADER TRADES DETAIL ==='
SELECT 
    trade_id,
    run_id,
    symbol,
    side,
    entry_ts,
    exit_ts,
    qty,
    entry_px,
    exit_px,
    realized_pnl,
    unrealized_pnl,
    fees,
    reason,
    leverage,
    status,
    created_at
FROM ft_trades 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
ORDER BY entry_ts;

-- =======================
-- 4. FAKE TRADER SIGNALS ANALYSIS
-- =======================

\echo '=== 4. FAKE TRADER SIGNALS - ALL SIGNALS ==='
SELECT 
    signal_id,
    run_id,
    symbol,
    signal_type,
    side,
    size,
    price,
    candle_data,
    strategy_state,
    rejection_reason,
    executed,
    execution_price,
    execution_notes,
    signal_ts,
    created_at
FROM ft_signals 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
ORDER BY signal_ts;

\echo '=== 4. FAKE TRADER SIGNALS - REJECTED SIGNALS ==='
SELECT 
    signal_id,
    symbol,
    signal_type,
    side,
    rejection_reason,
    candle_data,
    strategy_state,
    signal_ts
FROM ft_signals 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
  AND executed = FALSE
  AND rejection_reason IS NOT NULL
ORDER BY signal_ts;

\echo '=== 4. FAKE TRADER SIGNALS - EXECUTED SIGNALS ==='
SELECT 
    signal_id,
    symbol,
    signal_type,
    side,
    size,
    price,
    execution_price,
    execution_notes,
    signal_ts
FROM ft_signals 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
  AND executed = TRUE
ORDER BY signal_ts;

-- =======================
-- 5. EQUITY CURVES COMPARISON
-- =======================

\echo '=== 5. BACKTEST EQUITY CURVE (SAMPLE) ==='
SELECT 
    run_id,
    symbol,
    ts,
    equity
FROM bt_equity 
WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'
ORDER BY ts
LIMIT 20;

\echo '=== 5. FAKE TRADER EQUITY CURVE (SAMPLE) ==='
SELECT 
    run_id,
    symbol,
    ts,
    cash_balance,
    position_value,
    unrealized_pnl,
    total_equity,
    open_positions,
    total_exposure
FROM ft_equity 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
ORDER BY ts
LIMIT 20;

-- =======================
-- 6. TIME OVERLAP ANALYSIS
-- =======================

\echo '=== 6. TIME OVERLAP ANALYSIS ==='
WITH bt_time AS (
    SELECT 
        'backtest' as type,
        start_ts,
        end_ts,
        created_at
    FROM bt_runs 
    WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'
),
ft_time AS (
    SELECT 
        'fake_trader' as type,
        started_at as start_ts,
        stopped_at as end_ts,
        created_at
    FROM ft_runs 
    WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
)
SELECT * FROM bt_time
UNION ALL
SELECT * FROM ft_time;

-- =======================
-- 7. CANDLE DATA AVAILABILITY CHECK
-- =======================

\echo '=== 7. CHECKING FOR CANDLE/OHLCV DATA TABLES ==='
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE tablename LIKE '%ohlcv%' 
   OR tablename LIKE '%candle%'
   OR tablename LIKE '%kline%'
ORDER BY tablename;

-- =======================
-- 8. STRATEGY PARAMETERS DETAILED COMPARISON
-- =======================

\echo '=== 8. STRATEGY PARAMETERS JSON COMPARISON ==='
WITH bt_params AS (
    SELECT 
        'backtest' as source,
        run_id,
        strategy_name,
        strategy_version,
        params,
        jsonb_pretty(params) as params_formatted
    FROM bt_runs 
    WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'
),
ft_params AS (
    SELECT 
        'fake_trader' as source,
        run_id,
        strategy_name,
        strategy_version,
        params,
        jsonb_pretty(params) as params_formatted
    FROM ft_runs 
    WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
)
SELECT * FROM bt_params
UNION ALL
SELECT * FROM ft_params;

-- =======================
-- 9. SIGNAL TIMING ANALYSIS
-- =======================

\echo '=== 9. SIGNAL TIMING vs BACKTEST TRADE TIMING ==='
SELECT 
    'backtest_trades' as source,
    symbol,
    entry_ts as timestamp,
    'trade_entry' as event_type,
    side,
    entry_px as price,
    qty,
    pnl
FROM bt_trades 
WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'

UNION ALL

SELECT 
    'fake_trader_signals' as source,
    symbol,
    signal_ts as timestamp,
    signal_type as event_type,
    side,
    price,
    size as qty,
    NULL as pnl
FROM ft_signals 
WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'

ORDER BY timestamp;

-- =======================
-- 10. SUMMARY STATISTICS
-- =======================

\echo '=== 10. SUMMARY COMPARISON ==='
WITH bt_summary AS (
    SELECT 
        'backtest' as type,
        COUNT(*) as total_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl_per_trade,
        MIN(entry_ts) as first_trade,
        MAX(entry_ts) as last_trade
    FROM bt_trades 
    WHERE run_id = '06f19c3d-ac77-4fed-abb9-89643a7057fa'
),
ft_summary AS (
    SELECT 
        'fake_trader' as type,
        COUNT(*) as total_trades,
        COALESCE(SUM(realized_pnl), 0) as total_pnl,
        COALESCE(AVG(realized_pnl), 0) as avg_pnl_per_trade,
        MIN(entry_ts) as first_trade,
        MAX(entry_ts) as last_trade
    FROM ft_trades 
    WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
),
ft_signals_summary AS (
    SELECT 
        'fake_trader_signals' as type,
        COUNT(*) as total_signals,
        COUNT(CASE WHEN executed = TRUE THEN 1 END) as executed_signals,
        COUNT(CASE WHEN executed = FALSE AND rejection_reason IS NOT NULL THEN 1 END) as rejected_signals,
        MIN(signal_ts) as first_signal,
        MAX(signal_ts) as last_signal
    FROM ft_signals 
    WHERE run_id = 'f8068a5f-0b94-46d2-9385-5fa96e56bdc0'
)
SELECT 
    type,
    total_trades,
    total_pnl,
    avg_pnl_per_trade,
    first_trade,
    last_trade,
    NULL::integer as total_signals,
    NULL::integer as executed_signals,
    NULL::integer as rejected_signals
FROM bt_summary
UNION ALL
SELECT 
    type,
    total_trades,
    total_pnl,
    avg_pnl_per_trade,
    first_trade,
    last_trade,
    NULL::integer as total_signals,
    NULL::integer as executed_signals,
    NULL::integer as rejected_signals
FROM ft_summary
UNION ALL
SELECT 
    type,
    NULL::integer as total_trades,
    NULL::numeric as total_pnl,
    NULL::numeric as avg_pnl_per_trade,
    first_signal as first_trade,
    last_signal as last_trade,
    total_signals,
    executed_signals,
    rejected_signals
FROM ft_signals_summary;
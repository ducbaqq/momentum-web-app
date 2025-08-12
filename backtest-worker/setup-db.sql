-- Create backtest tables if they don't exist

-- Runs table to track backtest jobs
CREATE TABLE IF NOT EXISTS bt_runs (
  run_id UUID PRIMARY KEY,
  name TEXT,
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ NOT NULL,
  symbols TEXT[] NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1m',
  strategy_name TEXT NOT NULL,
  strategy_version TEXT NOT NULL DEFAULT '1.0',
  params JSONB,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

-- Results table to store per-symbol results
CREATE TABLE IF NOT EXISTS bt_results (
  run_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  pnl DECIMAL(15,6) NOT NULL DEFAULT 0,
  fees DECIMAL(15,6) NOT NULL DEFAULT 0,
  win_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  sharpe DECIMAL(8,4),
  sortino DECIMAL(8,4),
  max_dd DECIMAL(8,6),
  profit_factor DECIMAL(8,4),
  exposure DECIMAL(8,6),
  turnover DECIMAL(15,6),
  PRIMARY KEY (run_id, symbol),
  FOREIGN KEY (run_id) REFERENCES bt_runs(run_id) ON DELETE CASCADE
);

-- Equity curve table
CREATE TABLE IF NOT EXISTS bt_equity (
  run_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  equity DECIMAL(15,6) NOT NULL,
  PRIMARY KEY (run_id, symbol, ts),
  FOREIGN KEY (run_id) REFERENCES bt_runs(run_id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bt_runs_status ON bt_runs(status);
CREATE INDEX IF NOT EXISTS idx_bt_runs_created_at ON bt_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_bt_equity_ts ON bt_equity(run_id, symbol, ts);
-- Create bt_trades table for storing individual trade records

CREATE TABLE IF NOT EXISTS bt_trades (
  run_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  entry_ts TIMESTAMPTZ NOT NULL,
  exit_ts TIMESTAMPTZ,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  qty DECIMAL(15,6) NOT NULL,
  entry_px DECIMAL(15,6) NOT NULL,
  exit_px DECIMAL(15,6),
  pnl DECIMAL(15,6) NOT NULL DEFAULT 0,
  fees DECIMAL(15,6) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (run_id, symbol, entry_ts),
  FOREIGN KEY (run_id) REFERENCES bt_runs(run_id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bt_trades_run_id ON bt_trades(run_id);
CREATE INDEX IF NOT EXISTS idx_bt_trades_symbol ON bt_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_bt_trades_entry_ts ON bt_trades(entry_ts DESC);
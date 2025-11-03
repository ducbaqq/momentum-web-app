-- Migration: Add trade_id to ft_positions table
-- This separates position IDs from trade IDs and links them properly

-- Step 1: Add trade_id column (nullable initially)
ALTER TABLE ft_positions 
ADD COLUMN IF NOT EXISTS trade_id UUID REFERENCES ft_trades(trade_id) ON DELETE SET NULL;

-- Step 2: Create index for the new column
CREATE INDEX IF NOT EXISTS idx_ft_positions_trade_id ON ft_positions(trade_id);

-- Step 3: Backfill existing positions with matching trades
-- Match by run_id, symbol, side, and status = 'open'
UPDATE ft_positions p
SET trade_id = (
  SELECT trade_id 
  FROM ft_trades t
  WHERE t.run_id = p.run_id
    AND t.symbol = p.symbol
    AND t.side = p.side
    AND t.status = 'open'
    AND t.entry_ts >= p.opened_at - INTERVAL '1 minute'
    AND t.entry_ts <= p.opened_at + INTERVAL '1 minute'
  ORDER BY ABS(EXTRACT(EPOCH FROM (t.entry_ts - p.opened_at)))
  LIMIT 1
)
WHERE p.trade_id IS NULL 
  AND p.status = 'open';

-- Step 4: For closed positions, match with closed trades
UPDATE ft_positions p
SET trade_id = (
  SELECT trade_id 
  FROM ft_trades t
  WHERE t.run_id = p.run_id
    AND t.symbol = p.symbol
    AND t.side = p.side
    AND t.status = 'closed'
    AND t.entry_ts >= p.opened_at - INTERVAL '1 minute'
    AND t.entry_ts <= p.opened_at + INTERVAL '1 minute'
  ORDER BY ABS(EXTRACT(EPOCH FROM (t.entry_ts - p.opened_at)))
  LIMIT 1
)
WHERE p.trade_id IS NULL 
  AND p.status = 'closed';

-- Note: After this migration, new positions must include trade_id when created
-- The trade_id column should remain nullable for edge cases, but ideally should always be set


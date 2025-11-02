-- Migration: Add uniqueness constraint for position rules
-- This enforces: No overlapping LONG/SHORT positions for same symbol in same run
-- Run this script to add the unique index to your database

-- Position Rules: Enforce uniqueness constraints
-- Rule: No overlapping LONG/SHORT positions for same symbol in same run
-- This partial unique index enforces that you can't have both LONG and SHORT open at the same time
CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_positions_v2_unique_active_per_side 
  ON ft_positions_v2(run_id, symbol, side) 
  WHERE status IN ('NEW', 'OPEN');

-- Verify the index was created
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'ft_positions_v2' 
  AND indexname = 'idx_ft_positions_v2_unique_active_per_side';


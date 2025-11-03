-- Migration: Update ft_positions_v2 status constraint to allow 'NEW' status
-- This fixes the constraint to match the FSM: NEW → OPEN → CLOSED

-- Drop the old constraint
ALTER TABLE ft_positions_v2 
  DROP CONSTRAINT IF EXISTS ft_positions_v2_status_check;

-- Add the new constraint that allows 'NEW', 'OPEN', and 'CLOSED'
ALTER TABLE ft_positions_v2 
  ADD CONSTRAINT ft_positions_v2_status_check 
  CHECK (status IN ('NEW', 'OPEN', 'CLOSED'));

-- Update default status to 'NEW' (matches FSM)
ALTER TABLE ft_positions_v2 
  ALTER COLUMN status SET DEFAULT 'NEW';

-- Verify the constraint
SELECT 
  constraint_name, 
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'ft_positions_v2_status_check';


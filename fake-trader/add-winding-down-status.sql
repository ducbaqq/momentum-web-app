-- Add winding_down status to fake trader runs
ALTER TABLE ft_runs 
DROP CONSTRAINT IF EXISTS ft_runs_status_check;

ALTER TABLE ft_runs 
ADD CONSTRAINT ft_runs_status_check 
CHECK (status IN ('active', 'paused', 'stopped', 'error', 'winding_down'));
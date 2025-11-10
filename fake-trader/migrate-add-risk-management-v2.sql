-- Migration: Add stop_loss and take_profit to ft_positions_v2
-- This allows version 2 to use risk management features

ALTER TABLE ft_positions_v2 
ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8),
ADD COLUMN IF NOT EXISTS take_profit DECIMAL(20,8);

-- Add index for efficient stop loss/take profit queries
CREATE INDEX IF NOT EXISTS idx_ft_positions_v2_stop_loss ON ft_positions_v2(stop_loss) WHERE stop_loss IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft_positions_v2_take_profit ON ft_positions_v2(take_profit) WHERE take_profit IS NOT NULL;


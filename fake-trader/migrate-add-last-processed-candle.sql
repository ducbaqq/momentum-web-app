-- Migration: Add last_processed_candle column to ft_runs table
-- This column tracks the last candle timestamp processed by the fake trader

ALTER TABLE ft_runs 
ADD COLUMN IF NOT EXISTS last_processed_candle TIMESTAMP WITH TIME ZONE;


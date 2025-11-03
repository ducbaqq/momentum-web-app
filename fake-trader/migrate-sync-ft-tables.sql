-- Migration: Sync ft_* tables with momentum_collector database schema
-- This script ensures dev and staging databases match momentum_collector exactly
-- Run this after creating tables to add any missing columns or constraints

-- Add last_processed_candle column to ft_runs if it doesn't exist
ALTER TABLE ft_runs 
ADD COLUMN IF NOT EXISTS last_processed_candle TIMESTAMP WITHOUT TIME ZONE;

-- Update status constraint to include 'winding_down' if not already present
-- Drop and recreate the constraint to ensure it matches momentum_collector
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE table_name = 'ft_runs' 
        AND constraint_name LIKE '%status%check%'
    ) THEN
        ALTER TABLE ft_runs DROP CONSTRAINT ft_runs_status_check;
    END IF;
    
    -- Add constraint with all status values including 'winding_down'
    ALTER TABLE ft_runs 
    ADD CONSTRAINT ft_runs_status_check 
    CHECK (status IN ('active', 'paused', 'stopped', 'error', 'winding_down'));
END $$;

-- Ensure all columns match momentum_collector schema exactly
-- Note: This migration handles the most common differences.
-- For complex schema changes, tables should be recreated.

-- Verify ft_runs has all required columns
DO $$
BEGIN
    -- Check if last_processed_candle exists, if not add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ft_runs' 
        AND column_name = 'last_processed_candle'
    ) THEN
        ALTER TABLE ft_runs ADD COLUMN last_processed_candle TIMESTAMP WITHOUT TIME ZONE;
    END IF;
END $$;

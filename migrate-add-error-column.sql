-- Migration: Add error column to bt_runs table
-- Run this in your database to fix the missing column issue

ALTER TABLE bt_runs ADD COLUMN IF NOT EXISTS error TEXT;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'bt_runs' AND column_name = 'error';
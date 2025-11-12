-- Migration: Add sender_address column to swap_events table
-- Run this SQL in your Supabase SQL Editor to add the sender_address column

-- Add sender_address column (nullable for existing rows)
ALTER TABLE swap_events 
ADD COLUMN IF NOT EXISTS sender_address TEXT;

-- Create index for faster queries by sender address
CREATE INDEX IF NOT EXISTS idx_swap_events_sender_address ON swap_events(sender_address);

-- Create composite index for user swap history queries (sender + timestamp)
CREATE INDEX IF NOT EXISTS idx_swap_events_sender_timestamp ON swap_events(sender_address, timestamp DESC);

-- Note: Existing rows will have NULL sender_address
-- New swap events indexed after this migration will have sender_address populated
-- To backfill existing data, you would need to re-index historical events (optional)


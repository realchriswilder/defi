-- Supabase Tables for DEX Indexer
-- Run this SQL in your Supabase SQL Editor

-- Table for individual swap events
CREATE TABLE IF NOT EXISTS swap_events (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT UNIQUE NOT NULL,
  pool_address TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in TEXT NOT NULL, -- Store as string to handle bigint
  amount_out TEXT NOT NULL, -- Store as string to handle bigint
  block_number TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  sender_address TEXT, -- Address of the trader who initiated the swap
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance (optimized for fast queries)
CREATE INDEX IF NOT EXISTS idx_swap_events_pool_address ON swap_events(pool_address);
CREATE INDEX IF NOT EXISTS idx_swap_events_timestamp ON swap_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_swap_events_tx_hash ON swap_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_swap_events_token_in ON swap_events(token_in);
CREATE INDEX IF NOT EXISTS idx_swap_events_token_out ON swap_events(token_out);
CREATE INDEX IF NOT EXISTS idx_swap_events_sender_address ON swap_events(sender_address);
-- Composite index for timestamp filtering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_swap_events_timestamp_token_in ON swap_events(timestamp DESC, token_in);
CREATE INDEX IF NOT EXISTS idx_swap_events_timestamp_token_out ON swap_events(timestamp DESC, token_out);
-- Composite index for user swap history queries
CREATE INDEX IF NOT EXISTS idx_swap_events_sender_timestamp ON swap_events(sender_address, timestamp DESC);

-- Function to update last_updated timestamp (for pools table)
CREATE OR REPLACE FUNCTION update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop old tables/views if they exist (cleanup)
DROP VIEW IF EXISTS factory_volume_and_fees;
DROP VIEW IF EXISTS volume_and_fees;
DROP TABLE IF EXISTS daily_metrics;

-- Table for pool data (cached pool information)
CREATE TABLE IF NOT EXISTS pools (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT UNIQUE NOT NULL,
  token_a TEXT NOT NULL,
  token_b TEXT NOT NULL,
  token_a_symbol TEXT,
  token_b_symbol TEXT,
  reserve_a TEXT NOT NULL, -- Store as string to handle bigint
  reserve_b TEXT NOT NULL, -- Store as string to handle bigint
  reserve_a_decimals INTEGER DEFAULT 18,
  reserve_b_decimals INTEGER DEFAULT 18,
  total_liquidity NUMERIC(20, 2) DEFAULT 0, -- TVL in USD
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pools table
CREATE INDEX IF NOT EXISTS idx_pools_pool_address ON pools(pool_address);
CREATE INDEX IF NOT EXISTS idx_pools_token_a ON pools(token_a);
CREATE INDEX IF NOT EXISTS idx_pools_token_b ON pools(token_b);
CREATE INDEX IF NOT EXISTS idx_pools_last_updated ON pools(last_updated);

-- Trigger to update last_updated timestamp (for pools table)
DROP TRIGGER IF EXISTS update_pools_last_updated ON pools;
CREATE TRIGGER update_pools_last_updated 
  BEFORE UPDATE ON pools 
  FOR EACH ROW 
  EXECUTE FUNCTION update_last_updated_column();

-- Table for price history (for charts)
-- Stores periodic price snapshots for each pool/token pair
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  token_a TEXT NOT NULL,
  token_b TEXT NOT NULL,
  token_a_symbol TEXT,
  token_b_symbol TEXT,
  -- Price of tokenA in terms of tokenB (tokenB/tokenA ratio)
  price_a_per_b NUMERIC(30, 18) NOT NULL,
  -- Price of tokenB in terms of tokenA (tokenA/tokenB ratio)  
  price_b_per_a NUMERIC(30, 18) NOT NULL,
  -- Reserve amounts at this snapshot
  reserve_a TEXT NOT NULL,
  reserve_b TEXT NOT NULL,
  -- Timestamp for this price snapshot
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Unique constraint to prevent duplicate snapshots at same time
  UNIQUE(pool_address, timestamp)
);

-- Indexes for price_history table (optimized for chart queries)
CREATE INDEX IF NOT EXISTS idx_price_history_pool_address ON price_history(pool_address);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_token_a ON price_history(token_a);
CREATE INDEX IF NOT EXISTS idx_price_history_token_b ON price_history(token_b);
-- Composite index for most common query: pool + timestamp range
CREATE INDEX IF NOT EXISTS idx_price_history_pool_timestamp ON price_history(pool_address, timestamp DESC);


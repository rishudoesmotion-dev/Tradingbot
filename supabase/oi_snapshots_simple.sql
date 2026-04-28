-- Simple OI snapshots table for basic historical tracking
-- Run this in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS oi_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    strike INTEGER NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    symbol TEXT NOT NULL,
    oi BIGINT DEFAULT 0,
    ltp DECIMAL(10,2) DEFAULT 0,
    volume BIGINT DEFAULT 0,
    spot_price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_oi_snapshots_timestamp ON oi_snapshots (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_oi_snapshots_symbol ON oi_snapshots (symbol, strike, option_type);

-- Function to create table (called from API)
CREATE OR REPLACE FUNCTION create_oi_snapshots_table_if_not_exists()
RETURNS VOID AS $$
BEGIN
    -- This function is just for API compatibility
    -- The table creation is handled above
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function to keep only last 24 hours of data
CREATE OR REPLACE FUNCTION cleanup_old_oi_snapshots()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oi_snapshots 
    WHERE timestamp < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
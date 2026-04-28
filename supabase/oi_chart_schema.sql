-- OI Chart Schema for storing Open Interest snapshots
-- This will be used when you implement real-time OI data collection

-- Table to store OI snapshots every minute
CREATE TABLE IF NOT EXISTS market_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    timestamp_epoch INTEGER NOT NULL, -- Unix timestamp for easier querying
    symbol TEXT NOT NULL,
    strike INTEGER NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    expiry_date DATE NOT NULL,
    
    -- Market data
    ltp DECIMAL(10,2),
    bid DECIMAL(10,2),
    ask DECIMAL(10,2),
    volume BIGINT DEFAULT 0,
    open_interest BIGINT DEFAULT 0,
    
    -- Previous snapshot for change calculation
    prev_ltp DECIMAL(10,2),
    prev_volume BIGINT,
    prev_oi BIGINT,
    
    -- Calculated changes
    price_change DECIMAL(10,2),
    volume_change BIGINT,
    oi_change BIGINT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_source TEXT DEFAULT 'kotak_neo'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_market_snapshots_timestamp ON market_snapshots (timestamp_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_strike ON market_snapshots (symbol, strike, option_type, expiry_date);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_expiry ON market_snapshots (expiry_date);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_composite ON market_snapshots (symbol, expiry_date, timestamp_epoch DESC);

-- Table to store short covering alerts
CREATE TABLE IF NOT EXISTS short_covering_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    symbol TEXT NOT NULL,
    strike INTEGER NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    expiry_date DATE NOT NULL,
    
    -- Alert conditions
    price_change DECIMAL(10,2) NOT NULL,
    volume_change BIGINT NOT NULL,
    oi_change BIGINT NOT NULL,
    
    -- Alert metadata
    alert_description TEXT,
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
    is_cleared BOOLEAN DEFAULT FALSE,
    cleared_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON short_covering_alerts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON short_covering_alerts (symbol, expiry_date);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON short_covering_alerts (is_cleared, timestamp DESC);

-- Function to calculate and store snapshot with changes
CREATE OR REPLACE FUNCTION store_market_snapshot(
    p_timestamp_epoch INTEGER,
    p_symbol TEXT,
    p_strike INTEGER,
    p_option_type TEXT,
    p_expiry_date DATE,
    p_ltp DECIMAL(10,2),
    p_bid DECIMAL(10,2),
    p_ask DECIMAL(10,2),
    p_volume BIGINT,
    p_open_interest BIGINT
) RETURNS UUID AS $$
DECLARE
    prev_snapshot RECORD;
    new_snapshot_id BIGINT;
    price_diff DECIMAL(10,2) := 0;
    volume_diff BIGINT := 0;
    oi_diff BIGINT := 0;
    alert_threshold_met BOOLEAN := FALSE;
    new_alert_id UUID;
BEGIN
    -- Get the previous snapshot for this option
    SELECT ltp, volume, open_interest
    INTO prev_snapshot
    FROM market_snapshots
    WHERE symbol = p_symbol 
      AND strike = p_strike 
      AND option_type = p_option_type 
      AND expiry_date = p_expiry_date
    ORDER BY timestamp_epoch DESC
    LIMIT 1;
    
    -- Calculate changes
    IF prev_snapshot IS NOT NULL THEN
        price_diff := p_ltp - prev_snapshot.ltp;
        volume_diff := p_volume - prev_snapshot.volume;
        oi_diff := p_open_interest - prev_snapshot.open_interest;
    END IF;
    
    -- Insert new snapshot
    INSERT INTO market_snapshots (
        timestamp,
        timestamp_epoch,
        symbol,
        strike,
        option_type,
        expiry_date,
        ltp,
        bid,
        ask,
        volume,
        open_interest,
        prev_ltp,
        prev_volume,
        prev_oi,
        price_change,
        volume_change,
        oi_change
    ) VALUES (
        to_timestamp(p_timestamp_epoch),
        p_timestamp_epoch,
        p_symbol,
        p_strike,
        p_option_type,
        p_expiry_date,
        p_ltp,
        p_bid,
        p_ask,
        p_volume,
        p_open_interest,
        prev_snapshot.ltp,
        prev_snapshot.volume,
        prev_snapshot.open_interest,
        price_diff,
        volume_diff,
        oi_diff
    ) RETURNING id INTO new_snapshot_id;
    
    -- Check for short covering conditions:
    -- 1. Price increase > 1%
    -- 2. Volume increase > 10000
    -- 3. OI decrease > 5000
    IF prev_snapshot IS NOT NULL 
       AND price_diff > 0 
       AND (price_diff / prev_snapshot.ltp) > 0.01  -- >1% price increase
       AND volume_diff > 10000  -- >10K volume increase
       AND oi_diff < -5000      -- >5K OI decrease
    THEN
        -- Create short covering alert
        INSERT INTO short_covering_alerts (
            timestamp,
            symbol,
            strike,
            option_type,
            expiry_date,
            price_change,
            volume_change,
            oi_change,
            alert_description,
            severity
        ) VALUES (
            to_timestamp(p_timestamp_epoch),
            p_symbol,
            p_strike,
            p_option_type,
            p_expiry_date,
            price_diff,
            volume_diff,
            oi_diff,
            format('Price ↑ %s (%.1f%%), Volume ↑ %s, OI ↓ %s - Possible short covering',
                   price_diff,
                   (price_diff / prev_snapshot.ltp) * 100,
                   volume_diff,
                   ABS(oi_diff)
            ),
            CASE 
                WHEN ABS(oi_diff) > 50000 THEN 'high'
                WHEN ABS(oi_diff) > 20000 THEN 'medium'
                ELSE 'low'
            END
        ) RETURNING id INTO new_alert_id;
    END IF;
    
    RETURN COALESCE(new_alert_id, gen_random_uuid());
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old snapshots (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_snapshots() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM market_snapshots 
    WHERE timestamp < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample usage:
-- SELECT store_market_snapshot(
--     1713700800,  -- timestamp
--     'NIFTY',     -- symbol
--     24000,       -- strike
--     'CE',        -- option_type
--     '2024-04-25', -- expiry_date
--     125.50,      -- ltp
--     125.00,      -- bid
--     126.00,      -- ask
--     50000,       -- volume
--     250000       -- open_interest
-- );
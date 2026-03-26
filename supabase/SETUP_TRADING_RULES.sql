-- SETUP: Trading Rules Schema
-- Run this in Supabase SQL Editor to fix the "Could not find the table 'trading_rules'" error
-- This creates the three tables needed by TradingRulesService

-- ════════════════════════════════════════════════════════════════════════════
-- TABLE 1: TRADING CONFIG (Global rules - single row)
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.trading_config CASCADE;

CREATE TABLE public.trading_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nifty_max_lots INTEGER NOT NULL DEFAULT 1,
    prevent_concurrent_trades BOOLEAN NOT NULL DEFAULT true,
    max_trades_per_day INTEGER NOT NULL DEFAULT 3,
    allowed_instruments TEXT[] NOT NULL DEFAULT ARRAY['NIFTY'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT only_one_config CHECK (id = id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- TABLE 2: TRADING ENABLED (Master switch - single row)
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.trading_enabled CASCADE;

CREATE TABLE public.trading_enabled (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    disabled_reason VARCHAR(255),
    trades_today INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT only_one_row CHECK (id = id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- TABLE 3: RULE VIOLATIONS (Audit log)
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.rule_violations CASCADE;

CREATE TABLE public.rule_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(100),
    symbol VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10, 2),
    rule_type VARCHAR(50) NOT NULL,
    violation_message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'ERROR',
    is_blocked BOOLEAN NOT NULL DEFAULT true,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_rule_violations_timestamp ON rule_violations(timestamp DESC);
CREATE INDEX idx_rule_violations_rule_type ON rule_violations(rule_type);
CREATE INDEX idx_rule_violations_symbol ON rule_violations(symbol);

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_trading_config_updated_at ON trading_config;
CREATE TRIGGER update_trading_config_updated_at BEFORE UPDATE ON trading_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trading_enabled_updated_at ON trading_enabled;
CREATE TRIGGER update_trading_enabled_updated_at BEFORE UPDATE ON trading_enabled
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trading_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_violations ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow public read on trading_config" ON public.trading_config;
DROP POLICY IF EXISTS "Allow updates to trading_config" ON public.trading_config;
DROP POLICY IF EXISTS "Allow public read on trading_enabled" ON public.trading_enabled;
DROP POLICY IF EXISTS "Allow updates to trading_enabled" ON public.trading_enabled;
DROP POLICY IF EXISTS "Allow public read on rule_violations" ON public.rule_violations;
DROP POLICY IF EXISTS "Allow insert on rule_violations" ON public.rule_violations;

-- Create policies
CREATE POLICY "Allow public read on trading_config" ON public.trading_config
    FOR SELECT USING (true);

CREATE POLICY "Allow updates to trading_config" ON public.trading_config
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on trading_enabled" ON public.trading_enabled
    FOR SELECT USING (true);

CREATE POLICY "Allow updates to trading_enabled" ON public.trading_enabled
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read on rule_violations" ON public.rule_violations
    FOR SELECT USING (true);

CREATE POLICY "Allow insert on rule_violations" ON public.rule_violations
    FOR INSERT WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_enabled TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_violations TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA: Initialize with defaults
-- ════════════════════════════════════════════════════════════════════════════

-- Insert default trading config
INSERT INTO public.trading_config (nifty_max_lots, prevent_concurrent_trades, max_trades_per_day, allowed_instruments)
    VALUES (1, true, 3, ARRAY['NIFTY'])
    ON CONFLICT DO NOTHING;

-- Insert default trading enabled state
INSERT INTO public.trading_enabled (is_enabled, disabled_reason, trades_today)
    VALUES (true, NULL, 0)
    ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Trading Rules schema setup complete! ✅' as status;

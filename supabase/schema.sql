-- Supabase Database Schema for Trading Terminal
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Risk Configuration Table
CREATE TABLE IF NOT EXISTS risk_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    max_trades_per_day INTEGER NOT NULL DEFAULT 5,
    max_loss_limit NUMERIC(10, 2) NOT NULL DEFAULT 5000,
    max_lots INTEGER NOT NULL DEFAULT 10,
    max_position_size NUMERIC(15, 2) NOT NULL DEFAULT 100000,
    stop_loss_percentage NUMERIC(5, 2) NOT NULL DEFAULT 2.0,
    target_profit_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.0,
    enable_kill_switch BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trade Logs Table
CREATE TABLE IF NOT EXISTS trade_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    pnl NUMERIC(10, 2) DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    broker_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_order_id UNIQUE (order_id)
);

-- Positions Table
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL,
    product_type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    buy_quantity INTEGER DEFAULT 0,
    sell_quantity INTEGER DEFAULT 0,
    buy_price NUMERIC(10, 2) DEFAULT 0,
    sell_price NUMERIC(10, 2) DEFAULT 0,
    ltp NUMERIC(10, 2) DEFAULT 0,
    pnl NUMERIC(10, 2) DEFAULT 0,
    pnl_percentage NUMERIC(5, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_symbol_exchange UNIQUE (symbol, exchange, product_type)
);

-- Create indexes for better query performance
CREATE INDEX idx_trade_logs_timestamp ON trade_logs(timestamp DESC);
CREATE INDEX idx_trade_logs_symbol ON trade_logs(symbol);
CREATE INDEX idx_positions_symbol ON positions(symbol);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_risk_config_updated_at BEFORE UPDATE ON risk_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default risk configuration
INSERT INTO risk_config (
    max_trades_per_day,
    max_loss_limit,
    max_lots,
    max_position_size,
    stop_loss_percentage,
    target_profit_percentage,
    enable_kill_switch
) VALUES (
    5,
    5000,
    10,
    100000,
    2.0,
    5.0,
    true
) ON CONFLICT DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE risk_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your authentication setup)
-- For now, allowing all operations for authenticated users

CREATE POLICY "Allow all operations for authenticated users" ON risk_config
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON trade_logs
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON positions
    FOR ALL USING (auth.role() = 'authenticated');

-- Create a view for daily statistics
CREATE OR REPLACE VIEW daily_stats AS
SELECT 
    DATE(timestamp) as trade_date,
    COUNT(*) as total_trades,
    SUM(pnl) as realized_pnl,
    COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
    COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_trades,
    ROUND(
        (COUNT(CASE WHEN pnl > 0 THEN 1 END)::NUMERIC / 
         NULLIF(COUNT(*), 0) * 100), 2
    ) as win_rate
FROM trade_logs
GROUP BY DATE(timestamp)
ORDER BY trade_date DESC;

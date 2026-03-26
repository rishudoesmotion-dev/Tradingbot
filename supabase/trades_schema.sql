-- Trades/Orders Table
CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Order details
  symbol VARCHAR(50) NOT NULL,
  trading_symbol VARCHAR(100) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity INTEGER NOT NULL,
  entry_price DECIMAL(10, 2) NOT NULL,
  exit_price DECIMAL(10, 2),
  
  -- Order metadata
  order_type VARCHAR(20) NOT NULL DEFAULT 'MARKET',
  product_type VARCHAR(10) NOT NULL DEFAULT 'MIS',
  exchange_segment VARCHAR(20),
  
  -- Status & Tracking
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'REJECTED', 'CANCELLED')),
  entry_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_timestamp TIMESTAMP,
  
  -- P&L Tracking
  pnl DECIMAL(12, 2) DEFAULT 0,
  pnl_percentage DECIMAL(6, 2) DEFAULT 0,
  
  -- Additional metadata
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_entry_price CHECK (entry_price > 0),
  CONSTRAINT valid_exit_price CHECK (exit_price IS NULL OR exit_price > 0)
);

-- Create indexes for faster queries
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_entry_timestamp ON trades(entry_timestamp DESC);
CREATE INDEX idx_trades_user_status ON trades(user_id, status);

-- Create RLS policies
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own trades
CREATE POLICY "Users can view their own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own trades
CREATE POLICY "Users can insert their own trades"
  ON trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own trades
CREATE POLICY "Users can update their own trades"
  ON trades FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow users to delete their own trades
CREATE POLICY "Users can delete their own trades"
  ON trades FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trades_updated_at_trigger
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trades_updated_at();

-- View for trade statistics
CREATE OR REPLACE VIEW trade_statistics AS
SELECT
  user_id,
  COUNT(*) as total_trades,
  COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_trades,
  COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
  ROUND((SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2) as win_rate,
  SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as total_gains,
  SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END) as total_losses,
  SUM(pnl) as net_pnl,
  AVG(CASE WHEN pnl > 0 THEN pnl ELSE NULL END) as avg_winning_trade,
  AVG(CASE WHEN pnl < 0 THEN pnl ELSE NULL END) as avg_losing_trade,
  AVG(pnl) as avg_trade_pnl,
  MAX(entry_timestamp) as last_trade_date
FROM trades
GROUP BY user_id;

-- RLS for trade_statistics view
ALTER VIEW trade_statistics OWNER TO postgres;

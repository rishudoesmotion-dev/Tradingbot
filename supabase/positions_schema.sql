-- Positions Table
-- Stores current open positions with real-time P&L tracking
DROP TABLE IF EXISTS public.positions CASCADE;

CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(100) NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  product_type VARCHAR(20) NOT NULL DEFAULT 'MIS',
  quantity INTEGER NOT NULL,
  buy_quantity INTEGER NOT NULL DEFAULT 0,
  sell_quantity INTEGER NOT NULL DEFAULT 0,
  buy_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ltp DECIMAL(10, 2) NOT NULL DEFAULT 0,
  pnl DECIMAL(12, 2) NOT NULL DEFAULT 0,
  pnl_percentage DECIMAL(6, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Composite unique key: symbol must be unique (one position per symbol at a time)
  UNIQUE(symbol)
);

-- Create indexes for faster lookups
CREATE INDEX idx_positions_symbol ON public.positions(symbol);
CREATE INDEX idx_positions_updated_at ON public.positions(updated_at DESC);

-- Enable RLS - but allow anonymous (public) access for now
-- In production, this should be authenticated
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow everyone to read positions
CREATE POLICY "Enable read access for all users"
  ON public.positions
  FOR SELECT
  USING (true);

-- Policy: Allow everyone to insert/update positions
CREATE POLICY "Enable insert for all users"
  ON public.positions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON public.positions
  FOR UPDATE
  USING (true);

-- Policy: Allow delete
CREATE POLICY "Enable delete for all users"
  ON public.positions
  FOR DELETE
  USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER positions_updated_at_trigger
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION update_positions_updated_at();

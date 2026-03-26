-- Drop old tables if they exist (cleanup)
DROP TABLE IF EXISTS public.scrip_sync_log CASCADE;
DROP TABLE IF EXISTS public.scrip_master CASCADE;

-- Create scrip_master table with correct snake_case column names
-- Instrument token (p_tok) from Kotak scrip master is optional - not all instruments have it
CREATE TABLE public.scrip_master (
  id BIGSERIAL PRIMARY KEY,
  p_symbol TEXT NOT NULL,
  p_exch_seg TEXT NOT NULL,
  p_trd_symbol TEXT NOT NULL,
  l_lot_size INTEGER NOT NULL DEFAULT 1,
  p_instr_name TEXT,
  l_expiry_date BIGINT,
  p_tok TEXT,
  segment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(p_symbol, p_exch_seg)
);

-- Create scrip_sync_log table to track sync operations
CREATE TABLE public.scrip_sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_records INTEGER,
  segments TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_p_symbol ON public.scrip_master (p_symbol);
CREATE INDEX idx_segment ON public.scrip_master (segment);
CREATE INDEX idx_p_trd_symbol ON public.scrip_master (p_trd_symbol);
CREATE INDEX idx_p_tok ON public.scrip_master (p_tok);

-- Enable RLS (Row Level Security) for scrip_master
ALTER TABLE public.scrip_master ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow SELECT for all users
CREATE POLICY "Enable read access to scrip_master for all users" ON public.scrip_master
  FOR SELECT USING (true);

-- RLS Policy: Allow INSERT for all (service role and authenticated users)
CREATE POLICY "Enable insert access for authenticated users" ON public.scrip_master
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Allow DELETE for all (service role and authenticated users)
CREATE POLICY "Enable delete access for authenticated users" ON public.scrip_master
  FOR DELETE USING (true);

-- RLS Policy: Allow UPDATE for all (service role and authenticated users)
CREATE POLICY "Enable update access for authenticated users" ON public.scrip_master
  FOR UPDATE WITH CHECK (true);

-- Enable RLS for scrip_sync_log
ALTER TABLE public.scrip_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow SELECT for sync logs
CREATE POLICY "Enable read access to scrip_sync_log for all users" ON public.scrip_sync_log
  FOR SELECT USING (true);

-- RLS Policy: Allow INSERT for sync logs
CREATE POLICY "Enable insert access for scrip_sync_log" ON public.scrip_sync_log
  FOR INSERT WITH CHECK (true);

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON public.scrip_master TO anon, authenticated;
GRANT INSERT ON public.scrip_master TO anon, authenticated;
GRANT DELETE ON public.scrip_master TO anon, authenticated;
GRANT UPDATE ON public.scrip_master TO anon, authenticated;

-- Grant permissions for scrip_sync_log
GRANT SELECT ON public.scrip_sync_log TO anon, authenticated;
GRANT INSERT ON public.scrip_sync_log TO anon, authenticated;
GRANT DELETE ON public.scrip_master TO anon, authenticated;

GRANT SELECT ON public.scrip_sync_log TO anon, authenticated;
GRANT INSERT ON public.scrip_sync_log TO anon, authenticated;

-- migration.sql
-- Required for RiskManager.logTrade() upsert onConflict to work correctly.
-- The trades table needs a unique constraint on (user_id, symbol, entry_timestamp)
-- so duplicate logTrade() calls don't insert duplicate rows.
--
-- Run this once in your Supabase SQL editor.

ALTER TABLE public.trades
ADD CONSTRAINT trades_user_symbol_entry_key
UNIQUE (user_id, symbol, entry_timestamp);
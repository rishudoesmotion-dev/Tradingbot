-- migration_market_snapshots.sql
-- Run once in Supabase SQL editor.
-- Stores every AI analysis snapshot for audit trail and future backtesting.

create table public.market_snapshots (
  id              uuid not null default extensions.uuid_generate_v4(),
  user_id         uuid null references auth.users(id) on delete set null,
  timestamp       timestamp with time zone not null,
  mode            varchar(20) not null check (mode in ('candle_close', 'trade_mode')),

  -- NIFTY
  nifty_ltp       numeric(10, 2) not null,
  atm_strike      integer not null,
  candle_5m       jsonb null,          -- { open, high, low, close, volume }

  -- Heavyweights
  hdfcbank_ltp    numeric(10, 2) null,
  hdfcbank_ema9   numeric(10, 2) null,
  hdfcbank_ema21  numeric(10, 2) null,
  reliance_ltp    numeric(10, 2) null,
  reliance_ema9   numeric(10, 2) null,
  reliance_ema21  numeric(10, 2) null,

  -- Options chain (±5 ATM strikes, all fields)
  options_data    jsonb null,          -- OptionStrikeData[]

  -- Gemini response
  ai_sentiment    varchar(10) null,    -- BULLISH | BEARISH | NEUTRAL
  ai_score        integer null,        -- -100 to +100
  ai_summary      text null,
  ai_signals      jsonb null,          -- string[]
  ai_raw          text null,

  created_at      timestamp with time zone default current_timestamp,

  constraint market_snapshots_pkey primary key (id)
) tablespace pg_default;

-- Indexes for fast queries
create index idx_market_snapshots_timestamp on public.market_snapshots using btree (timestamp desc);
create index idx_market_snapshots_user_id   on public.market_snapshots using btree (user_id);
create index idx_market_snapshots_mode      on public.market_snapshots using btree (mode);

-- RLS
alter table public.market_snapshots enable row level security;

create policy "Users see own snapshots"
  on public.market_snapshots for select
  using (auth.uid() = user_id);

create policy "Users insert own snapshots"
  on public.market_snapshots for insert
  with check (auth.uid() = user_id);
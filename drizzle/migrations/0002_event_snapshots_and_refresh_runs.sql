-- Durable per-source event snapshots + scheduled-refresh bookkeeping.
-- Server-only tables: RLS enabled, no public policies (accessed via the admin client).

create table if not exists public.event_snapshots (
  source text primary key,
  events jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  complete boolean not null default false,
  skipped integer not null default 0,
  status text not null default 'error',
  error text,
  updated_at timestamptz not null default now()
);

grant all on public.event_snapshots to service_role;

alter table public.event_snapshots enable row level security;

-- One row per scheduled slot (e.g. "2026-10-12:04:00:America/New_York") so duplicate
-- scheduler deliveries never run overlapping imports.
create table if not exists public.refresh_runs (
  slot_key text primary key,
  ran_at timestamptz not null default now(),
  result jsonb
);

grant all on public.refresh_runs to service_role;

alter table public.refresh_runs enable row level security;
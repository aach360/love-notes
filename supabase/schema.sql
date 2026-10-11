-- Proposed schema (NOT applied). Owner: feat/event-ingestion.
create table if not exists public.events (
  id text primary key,
  source text not null,
  source_event_id text not null,
  source_url text,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/New_York',
  location text,
  organizer text,
  image_url text,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  cost_amount numeric,
  cost_text text,
  eligibility text,
  status text not null default 'scheduled',
  last_fetched_at timestamptz not null,
  is_demo boolean not null default false,
  ai_summary text,
  ai_tags text[] not null default '{}',
  unique (source_event_id, source)
);
alter table public.events enable row level security;
create policy "public read events" on public.events for select to anon, authenticated using (true);
-- writes only via service role in the protected import server function

create table if not exists public.user_state (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
create policy "own state" on public.user_state for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

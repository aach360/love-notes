-- UNCitall: apply only to a NEW, empty Supabase project.
-- Existing application migrations, excluding optional cron extensions.
-- Use the independent host scheduler for refreshes.

-- drizzle/migrations/0000_migration.sql
CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  join_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  device_token_hash text,
  phone text,
  alerts_opt_in boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, device_token_hash),
  UNIQUE (club_id, phone)
);
GRANT ALL ON public.club_members TO service_role;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.club_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','imessage')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_messages_club_time ON public.club_messages (club_id, created_at);
GRANT ALL ON public.club_messages TO service_role;
ALTER TABLE public.club_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agent_alerts_sent (
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, event_id)
);
GRANT ALL ON public.agent_alerts_sent TO service_role;
ALTER TABLE public.agent_alerts_sent ENABLE ROW LEVEL SECURITY;

-- drizzle/migrations/0001_migration.sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_app_state (
  user_id uuid PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_app_state TO authenticated;
GRANT ALL ON public.user_app_state TO service_role;
ALTER TABLE public.user_app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own state read" ON public.user_app_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own state insert" ON public.user_app_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state update" ON public.user_app_state FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state delete" ON public.user_app_state FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- drizzle/migrations/0002_event_snapshots_and_refresh_runs.sql
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

-- drizzle/migrations/0003_create_event_snapshots_and_refresh_runs.sql
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

create table if not exists public.refresh_runs (
  slot_key text primary key,
  ran_at timestamptz not null default now(),
  result jsonb
);

grant all on public.refresh_runs to service_role;

alter table public.refresh_runs enable row level security;

-- supabase/migrations/20261010000000_photon_messaging.sql
-- Server-owned Photon state. Apply with the existing Supabase migrations.
create table public.photon_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  sender text not null,
  space_id text not null,
  line_address text not null,
  user_id uuid unique references auth.users(id) on delete set null,
  pending_user_id uuid unique references auth.users(id) on delete set null,
  pending_until timestamptz,
  reminders_enabled boolean not null default false,
  lead_minutes integer not null default 30 check (lead_minutes in (15,30,60)),
  suppressed boolean not null default false,
  created_at timestamptz not null default now(),
  last_inbound_at timestamptz not null default now(),
  unique(project_id, sender)
);
create table public.photon_link_codes (
  code_hash text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create table public.photon_inbox (
  project_id text not null,
  message_id text not null,
  contact_id uuid references public.photon_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, message_id)
);
create index photon_inbox_rate on public.photon_inbox(contact_id, created_at);
create table public.photon_reminders (
  contact_id uuid not null references public.photon_contacts(id) on delete cascade,
  event_id text not null,
  lead_minutes integer not null check (lead_minutes in (15,30,60)),
  active boolean not null default true,
  primary key(contact_id, event_id)
);
create table public.photon_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  contact_id uuid not null references public.photon_contacts(id) on delete cascade,
  kind text not null check(kind in ('reply','club','alert','reminder')),
  body text not null,
  event_id text,
  event_start timestamptz,
  lead_minutes integer,
  plan_derived boolean not null default false,
  state text not null default 'queued' check(state in ('queued','leased','sending','sent','unknown','cancelled','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lease_token uuid,
  lease_until timestamptz,
  provider_message_id text,
  result_detail text
);
create index photon_outbox_due on public.photon_outbox(state, created_at);
create table public.photon_health (
  project_id text primary key,
  heartbeat_at timestamptz not null default now()
);

alter table public.photon_contacts enable row level security;
alter table public.photon_link_codes enable row level security;
alter table public.photon_inbox enable row level security;
alter table public.photon_reminders enable row level security;
alter table public.photon_outbox enable row level security;
alter table public.photon_health enable row level security;
revoke all on public.photon_contacts, public.photon_link_codes, public.photon_inbox, public.photon_reminders, public.photon_outbox, public.photon_health from anon, authenticated;
grant all on public.photon_contacts, public.photon_link_codes, public.photon_inbox, public.photon_reminders, public.photon_outbox, public.photon_health to service_role;

-- One transaction for dedupe, mutations, and the durable reply. Only trusted server code calls it.
create function public.photon_receive(p jsonb) returns boolean language plpgsql security definer set search_path = public as $$
declare
 c photon_contacts; code photon_link_codes; v_reply text := p->>'reply'; cmd text := p->>'command';
 club clubs; member club_members; n integer; item jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended((p->>'projectId') || ':' || (p->>'sender'), 0));
 if exists(select 1 from photon_inbox where project_id=p->>'projectId' and message_id=p->>'messageId') then return false; end if;
 insert into photon_contacts(project_id,sender,space_id,line_address) values(p->>'projectId',p->>'sender',p->>'spaceId',p->>'lineAddress')
 on conflict(project_id,sender) do update set space_id=excluded.space_id,line_address=excluded.line_address,last_inbound_at=now() returning * into c;
 insert into photon_inbox(project_id,message_id,contact_id) values(p->>'projectId',p->>'messageId',c.id);
 select count(*) into n from photon_inbox where contact_id=c.id and created_at > now()-interval '1 minute';
 if n > 30 and cmd not in ('stop','start') then return true; end if;
 if cmd='stop' then
   update photon_contacts set suppressed=true,reminders_enabled=false where id=c.id;
   update photon_reminders set active=false where contact_id=c.id;
   update photon_outbox set state='cancelled' where contact_id=c.id and state in ('queued','leased');
   update club_members set alerts_opt_in=false where phone=c.sender;
   return true; -- No messages, including replies, after STOP.
 elsif cmd='start' then
   update photon_contacts set suppressed=false where id=c.id;
   v_reply := 'Replies are enabled. Reminders remain off; send reminders on to enable plan reminders.';
 elsif c.suppressed then return true;
 elsif cmd='link' then
   select * into code from photon_link_codes where code_hash=p->>'codeHash' and expires_at>now() for update;
   if code.user_id is null then v_reply := 'That link code is invalid or expired. Generate a new code in the app.';
   elsif c.user_id is not null then v_reply := 'This conversation is already linked. Disconnect it in the app before linking again.';
   else
     delete from photon_link_codes where code_hash=code.code_hash;
     update photon_contacts set pending_user_id=null,pending_until=null where pending_user_id=code.user_id;
     update photon_contacts set pending_user_id=code.user_id,pending_until=now()+interval '10 minutes' where id=c.id;
     v_reply := 'Return to the app and confirm this connection. Reminders are still off.';
   end if;
 elsif cmd in ('plan','reminders_on','reminders_off','remind','cancel') and c.user_id is null then
   v_reply := 'Connect and confirm iMessage in the app before using your plan or reminders.';
 elsif cmd='plan' then
   v_reply := 'Your saved plan (Eastern time):'; n := 0;
   for item in select value from user_app_state u, jsonb_array_elements(coalesce(u.state->'plan','[]'::jsonb)) where u.user_id=c.user_id order by value->'event'->>'startsAt' loop
     n := n+1; exit when n>15;
     v_reply := v_reply || E'\n' || coalesce(item->'event'->>'title','Untitled event') || ' — ' || to_char((item->'event'->>'startsAt')::timestamptz at time zone 'America/New_York','Mon DD, HH12:MI AM');
   end loop;
   if n=0 then v_reply := 'Your cloud plan is empty. Add events in the app while signed in.'; end if;
 elsif cmd='reminders_on' then
   update photon_contacts set reminders_enabled=true where id=c.id;
   v_reply := 'Plan reminders enabled, ' || c.lead_minutes || ' minutes before each timed event. Reply STOP to stop all messages.';
 elsif cmd='reminders_off' then
   update photon_contacts set reminders_enabled=false where id=c.id;
   update photon_reminders set active=false where contact_id=c.id;
   update photon_outbox set state='cancelled' where contact_id=c.id and kind='reminder' and state in ('queued','leased');
   v_reply := 'All event reminders are off.';
 elsif cmd='remind' and p->>'eventId' is not null then
   insert into photon_reminders(contact_id,event_id,lead_minutes) values(c.id,p->>'eventId',(p->>'leadMinutes')::integer)
   on conflict(contact_id,event_id) do update set lead_minutes=excluded.lead_minutes,active=true;
 elsif cmd='cancel' then
   insert into photon_reminders(contact_id,event_id,lead_minutes,active) values(c.id,p->>'eventId',30,false)
   on conflict(contact_id,event_id) do update set active=false;
   update photon_outbox set state='cancelled' where contact_id=c.id and event_id=p->>'eventId' and state in ('queued','leased');
   v_reply := 'Reminder cancelled for that event, including its plan reminder.';
 elsif cmd='join' then
   select * into club from clubs where join_code=p->>'clubCode';
   if club.id is null then v_reply := 'That join code does not match a club.';
   else
     insert into club_members(club_id,phone,display_name) values(club.id,c.sender,p->>'displayName')
     on conflict(club_id,phone) do update set display_name=excluded.display_name;
     v_reply := 'Joined ' || club.name || '. Post with ' || club.join_code || ' your message. Other texts stay private with the bot.';
   end if;
 elsif cmd='club' then
   select m.* into member from club_members m join clubs b on b.id=m.club_id where m.phone=c.sender and b.join_code=p->>'clubCode';
   if member.id is null then v_reply := 'Join that club before posting to it.';
   else
     insert into club_messages(club_id,member_id,author_name,body,source) values(member.club_id,member.id,member.display_name,p->>'clubBody','imessage');
     v_reply := 'Posted to your club.';
   end if;
 elsif cmd in ('alerts_on','alerts_off') then
   update club_members set alerts_opt_in=(cmd='alerts_on') where phone=c.sender;
   get diagnostics n = row_count;
   v_reply := case when n=0 then 'Join a club first: join CODE YourName' when cmd='alerts_on' then 'Club event alerts enabled.' else 'Club event alerts disabled.' end;
 end if;
 if v_reply is not null then
   insert into photon_outbox(dedupe_key,contact_id,kind,body,expires_at)
   values('reply:'||(p->>'projectId')||':'||(p->>'messageId'),c.id,'reply',left(v_reply,6000),now()+interval '10 minutes') on conflict do nothing;
 end if;
 return true;
end $$;

-- Authenticated website calls pass a server-verified user ID. These functions are service-role only.
create function public.photon_account(p_user uuid, p_action text, p_value jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$
declare c photon_contacts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_action='code' then
   if exists(select 1 from photon_contacts where user_id=p_user) then raise exception 'Disconnect before relinking'; end if;
   if exists(select 1 from photon_link_codes where user_id=p_user and expires_at>now()+interval '9 minutes') then raise exception 'Wait a minute before generating another code'; end if;
   update photon_contacts set pending_user_id=null,pending_until=null where pending_user_id=p_user;
   insert into photon_link_codes(code_hash,user_id,expires_at) values(p_value->>'hash',p_user,now()+interval '10 minutes')
   on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
 elsif p_action='confirm' then
   select * into c from photon_contacts where id=(p_value->>'contactId')::uuid and pending_user_id=p_user and pending_until>now() for update;
   if c.id is null or c.suppressed then raise exception 'No active pending connection'; end if;
   if exists(select 1 from photon_contacts where user_id=p_user) then raise exception 'Already linked'; end if;
   update photon_contacts set user_id=p_user,pending_user_id=null,pending_until=null,reminders_enabled=false where id=c.id;
 elsif p_action='disconnect' then
   update photon_outbox set state='cancelled' where contact_id in (select id from photon_contacts where user_id=p_user or pending_user_id=p_user) and state in ('queued','leased');
   delete from photon_reminders where contact_id in (select id from photon_contacts where user_id=p_user or pending_user_id=p_user);
   update photon_contacts set user_id=null,pending_user_id=null,pending_until=null,reminders_enabled=false where user_id=p_user or pending_user_id=p_user;
   delete from photon_link_codes where user_id=p_user;
 elsif p_action='preferences' then
   select * into c from photon_contacts where user_id=p_user for update;
   if c.id is null or c.suppressed then raise exception 'Connect iMessage or text START first'; end if;
   update photon_contacts set reminders_enabled=(p_value->>'enabled')::boolean,lead_minutes=(p_value->>'leadMinutes')::integer where id=c.id;
   update photon_outbox set state='cancelled' where contact_id=c.id and kind='reminder' and state in ('queued','leased');
   if not (p_value->>'enabled')::boolean then update photon_reminders set active=false where contact_id=c.id; end if;
 else raise exception 'Invalid action'; end if;
end $$;

-- Only one worker can lease a message. A send whose outcome is uncertain is never automatically retried.
create function public.photon_claim(p_project text) returns setof public.photon_outbox language plpgsql security definer set search_path=public as $$
begin
 insert into photon_health(project_id) values(p_project) on conflict(project_id) do update set heartbeat_at=now();
 update photon_outbox set state='unknown',result_detail='Agent stopped during send' where state='sending' and lease_until<now();
 update photon_outbox set state='queued',lease_token=null where state='leased' and lease_until<now();
 update photon_outbox set state='cancelled' where state in ('queued','leased') and expires_at<=now();
 return query with candidate as (
   select j.id from photon_outbox j join photon_contacts c on c.id=j.contact_id
   where j.state='queued' and j.expires_at>now() and not c.suppressed and c.project_id=p_project
   order by case when j.kind='reply' then 0 when j.kind='reminder' then 1 else 2 end,j.created_at
   for update of j skip locked limit 1
 ) update photon_outbox j set state='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from candidate where j.id=candidate.id returning j.*;
end $$;

create function public.photon_delivery(p_id uuid,p_lease uuid,p_action text,p_provider text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare j photon_outbox; c photon_contacts;
begin
 select * into j from photon_outbox where id=p_id for update;
 if j.id is null or j.lease_token is distinct from p_lease then return false; end if;
 if p_action='sent' and j.state='sent' and j.provider_message_id is not distinct from p_provider then return true; end if;
 select * into c from photon_contacts where id=j.contact_id for update;
 if p_action='sending' then
   if j.state<>'leased' or j.expires_at<=now() or j.lease_until<=now() or c.suppressed then return false; end if;
   if j.kind='reminder' then
     if c.user_id is null then return false; end if;
     if j.plan_derived and (not c.reminders_enabled or not exists(select 1 from user_app_state u,jsonb_array_elements(coalesce(u.state->'plan','[]'::jsonb)) e where u.user_id=c.user_id and e->>'eventId'=j.event_id)) then return false; end if;
     if exists(select 1 from photon_reminders where contact_id=c.id and event_id=j.event_id and not active) then return false; end if;
     if not j.plan_derived and not exists(select 1 from photon_reminders where contact_id=c.id and event_id=j.event_id and active and lead_minutes=j.lead_minutes) then return false; end if;
     if j.plan_derived and c.lead_minutes<>j.lead_minutes then return false; end if;
   end if;
   update photon_outbox set state='sending',lease_until=now()+interval '2 minutes' where id=j.id;
 elsif p_action in ('sent','unknown') then
   if j.state not in ('sending','unknown') then return false; end if;
   update photon_outbox set state=p_action,provider_message_id=p_provider where id=j.id;
 elsif p_action='cancelled' then
   if j.state<>'leased' then return false; end if;
   update photon_outbox set state='cancelled' where id=j.id;
 else return false; end if;
 return true;
end $$;

revoke all on function public.photon_receive(jsonb),public.photon_account(uuid,text,jsonb),public.photon_claim(text),public.photon_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.photon_receive(jsonb),public.photon_account(uuid,text,jsonb),public.photon_claim(text),public.photon_delivery(uuid,uuid,text,text) to service_role;


-- Connect a verified account's iMessage sender to a proven device membership.
create function public.photon_club_link(p_user uuid,p_club uuid,p_device_hash text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare c photon_contacts; m club_members; other club_members;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_club::text,0));
 select * into m from club_members where club_id=p_club and device_token_hash=p_device_hash for update;
 if m.id is null then raise exception 'Join this club on this device first'; end if;
 select * into c from photon_contacts where user_id=p_user for update;
 if c.id is null or c.suppressed then raise exception 'Connect iMessage and text START first'; end if;
 if not p_enabled then
   if m.phone=c.sender then update club_members set phone=null,alerts_opt_in=false where id=m.id; end if;
   return false;
 end if;
 if m.phone is not null and m.phone<>c.sender then raise exception 'This membership already has another iMessage connection'; end if;
 select * into other from club_members where club_id=p_club and phone=c.sender and id<>m.id for update;
 if other.id is not null then
   if other.device_token_hash is not null then raise exception 'This iMessage membership is linked to another device'; end if;
   update club_messages set member_id=m.id where member_id=other.id;
   -- Messages retain their authors and move to the unified membership.
   delete from club_members where id=other.id;
 end if;
 update club_members set phone=c.sender where id=m.id;
 return true;
end $$;
revoke all on function public.photon_club_link(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.photon_club_link(uuid,uuid,text,boolean) to service_role;

alter table public.photon_outbox add column club_id uuid references public.clubs(id) on delete cascade;
create or replace function public.photon_delivery(p_id uuid,p_lease uuid,p_action text,p_provider text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare j photon_outbox; c photon_contacts;
begin
 select * into j from photon_outbox where id=p_id for update;
 if j.id is null or j.lease_token is distinct from p_lease then return false; end if;
 if p_action='sent' and j.state='sent' and j.provider_message_id is not distinct from p_provider then return true; end if;
 select * into c from photon_contacts where id=j.contact_id for update;
 if p_action='sending' then
   if j.state<>'leased' or j.expires_at<=now() or j.lease_until<=now() or c.suppressed then return false; end if;
   if j.kind in ('club','alert') and (j.club_id is null or not exists(select 1 from club_members where club_id=j.club_id and phone=c.sender and (j.kind='club' or alerts_opt_in))) then return false; end if;
   if j.kind='reminder' then
     if c.user_id is null then return false; end if;
     if j.plan_derived and (not c.reminders_enabled or not exists(select 1 from user_app_state u,jsonb_array_elements(coalesce(u.state->'plan','[]'::jsonb)) e where u.user_id=c.user_id and e->>'eventId'=j.event_id)) then return false; end if;
     if exists(select 1 from photon_reminders where contact_id=c.id and event_id=j.event_id and not active) then return false; end if;
     if not j.plan_derived and not exists(select 1 from photon_reminders where contact_id=c.id and event_id=j.event_id and active and lead_minutes=j.lead_minutes) then return false; end if;
     if j.plan_derived and c.lead_minutes<>j.lead_minutes then return false; end if;
   end if;
   update photon_outbox set state='sending',lease_until=now()+interval '2 minutes' where id=j.id;
 elsif p_action in ('sent','unknown') then
   if j.state not in ('sending','unknown') then return false; end if;
   update photon_outbox set state=p_action,provider_message_id=p_provider where id=j.id;
 elsif p_action='cancelled' then
   if j.state<>'leased' then return false; end if;
   update photon_outbox set state='cancelled' where id=j.id;
 else return false; end if;
 return true;
end $$;

create or replace function public.photon_account(p_user uuid, p_action text, p_value jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$
declare c photon_contacts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_action='code' then
   if exists(select 1 from photon_contacts where user_id=p_user) then raise exception 'Disconnect before relinking'; end if;
   if exists(select 1 from photon_link_codes where user_id=p_user and expires_at>now()+interval '9 minutes') then raise exception 'Wait a minute before generating another code'; end if;
   update photon_contacts set pending_user_id=null,pending_until=null where pending_user_id=p_user;
   insert into photon_link_codes(code_hash,user_id,expires_at) values(p_value->>'hash',p_user,now()+interval '10 minutes')
   on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
 elsif p_action='confirm' then
   select * into c from photon_contacts where id=(p_value->>'contactId')::uuid and pending_user_id=p_user and pending_until>now() for update;
   if c.id is null or c.suppressed then raise exception 'No active pending connection'; end if;
   if exists(select 1 from photon_contacts where user_id=p_user) then raise exception 'Already linked'; end if;
   update photon_contacts set user_id=p_user,pending_user_id=null,pending_until=null,reminders_enabled=false where id=c.id;
 elsif p_action='disconnect' then
   update club_members set phone=null,alerts_opt_in=false where device_token_hash is not null and phone in (select sender from photon_contacts where user_id=p_user);

   update photon_outbox set state='cancelled' where contact_id in (select id from photon_contacts where user_id=p_user or pending_user_id=p_user) and state in ('queued','leased');
   delete from photon_reminders where contact_id in (select id from photon_contacts where user_id=p_user or pending_user_id=p_user);
   update photon_contacts set user_id=null,pending_user_id=null,pending_until=null,reminders_enabled=false where user_id=p_user or pending_user_id=p_user;
   delete from photon_link_codes where user_id=p_user;
 elsif p_action='preferences' then
   select * into c from photon_contacts where user_id=p_user for update;
   if c.id is null or c.suppressed then raise exception 'Connect iMessage or text START first'; end if;
   update photon_contacts set reminders_enabled=(p_value->>'enabled')::boolean,lead_minutes=(p_value->>'leadMinutes')::integer where id=c.id;
   update photon_outbox set state='cancelled' where contact_id=c.id and kind='reminder' and state in ('queued','leased');
   if not (p_value->>'enabled')::boolean then update photon_reminders set active=false where contact_id=c.id; end if;
 else raise exception 'Invalid action'; end if;
end $$;


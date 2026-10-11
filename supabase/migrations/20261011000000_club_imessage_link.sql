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


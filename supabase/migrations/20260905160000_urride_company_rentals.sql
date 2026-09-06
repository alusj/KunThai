-- Company-managed self-drive rentals. Runtime operator fleets are never used.
begin;
alter table public.transport_company_fleets drop constraint if exists transport_company_fleets_service_category_check;
alter table public.transport_company_fleets add constraint transport_company_fleets_service_category_check check (service_category in ('Ride only','Delivery only','Ride and delivery','Rental'));
create table if not exists public.transport_company_rentals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  company_fleet_id uuid not null unique references public.transport_company_fleets(id) on delete restrict,
  title text not null default '',
  specifications text not null default '',
  photos text[] not null default '{}',
  currency text not null default 'SLE',
  hourly_rate numeric(14,2), daily_rate numeric(14,2), weekly_rate numeric(14,2),
  deposit numeric(14,2) not null default 0 check (deposit >= 0),
  terms text not null default '', pickup_address text not null default '',
  latitude double precision, longitude double precision,
  status text not null default 'hidden' check (status in ('available','reserved','rented_out','maintenance','hidden')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hourly_rate is null or hourly_rate > 0),
  check (daily_rate is null or daily_rate > 0),
  check (weekly_rate is null or weekly_rate > 0),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.transport_rental_reservations (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.transport_company_rentals(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  starts_at timestamptz not null, ends_at timestamptz not null,
  rate_unit text not null check (rate_unit in ('hour','day','week')),
  total_price numeric(14,2) not null check (total_price > 0),
  deposit numeric(14,2) not null default 0, currency text not null,
  customer_name text not null, contact_phone text not null, note text not null default '',
  terms_snapshot text not null,
  status text not null default 'requested' check (status in ('requested','confirmed','active','completed','declined','cancelled')),
  managed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists transport_rental_dates on public.transport_rental_reservations(rental_id, starts_at, ends_at) where status in ('confirmed','active');
create index if not exists transport_rental_customer on public.transport_rental_reservations(customer_user_id, created_at desc);

create or replace function public.can_manage_transport_rentals(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and (
    exists (select 1 from public.transport_companies where id = p_company_id and owner_user_id = auth.uid())
    or exists (select 1 from public.transport_company_members where company_id = p_company_id
      and user_id = auth.uid() and role = 'admin' and status = 'active' and coalesce(service_status,'active') = 'active')
  );
$$;

-- Serialize all reservation changes on the parent rental, including simultaneous
-- approvals, so overlapping confirmed dates cannot both commit. The trigger
-- also protects writes by trusted jobs, not just the public RPC.
create or replace function public.guard_transport_rental_dates()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  perform id from public.transport_company_rentals where id = new.rental_id for update;
  if new.status in ('confirmed','active') and exists (
    select 1 from public.transport_rental_reservations r
    where r.rental_id = new.rental_id and r.id <> new.id and r.status in ('confirmed','active')
      and r.starts_at < new.ends_at and r.ends_at > new.starts_at
  ) then raise exception 'This vehicle already has a confirmed rental during these dates.' using errcode = '23P01'; end if;
  return new;
end;
$$;
create trigger guard_transport_rental_dates before insert or update on public.transport_rental_reservations for each row execute function public.guard_transport_rental_dates();

create or replace function public.guard_company_rental_fleet()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'DELETE' then
    if old.service_category = 'Rental' and auth.uid() is not null and not public.can_manage_transport_rentals(old.company_id) then
      raise exception 'Only the company owner or an active admin can manage rentals.';
    end if;
    return old;
  end if;
  if new.service_category = 'Rental' or (tg_op = 'UPDATE' and old.service_category = 'Rental') then
    if auth.uid() is not null and not public.can_manage_transport_rentals(new.company_id) then
      raise exception 'Only the company owner or an active admin can manage rentals.';
    end if;
    if new.service_category = 'Rental' and (new.operator_id is not null or jsonb_array_length(coalesce(new.operators,'[]'::jsonb)) > 0) then
      raise exception 'Self-drive rentals cannot have an assigned operator.';
    end if;
    if new.service_category = 'Rental' and exists (
      select 1 from public.transport_fleets where company_fleet_id = new.id
    ) then
      raise exception 'Register a separate Rental fleet. This fleet already has an operator runtime record and must retain its trip history.';
    end if;
    if tg_op = 'UPDATE' and new.service_category <> 'Rental' and exists (
      select 1 from public.transport_company_rentals where company_fleet_id = new.id
    ) then raise exception 'Keep this fleet in Rental to preserve its reservations.'; end if;
  end if;
  return new;
end;
$$;
create trigger guard_company_rental_fleet before insert or update or delete on public.transport_company_fleets for each row execute function public.guard_company_rental_fleet();

create or replace function public.guard_rental_runtime_fleet()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (select 1 from public.transport_company_fleets where id = new.company_fleet_id and service_category = 'Rental') then
    raise exception 'Rentals use fixed pickup listings and cannot be assigned to live operators.';
  end if;
  return new;
end;
$$;
create trigger guard_rental_runtime_fleet before insert or update on public.transport_fleets for each row execute function public.guard_rental_runtime_fleet();

create or replace function public.guard_rental_operator_invite()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (select 1 from public.transport_company_fleets where id = new.company_fleet_id and service_category = 'Rental') then
    raise exception 'Self-drive rentals are managed by the company owner or admin; operator invitations are not allowed.';
  end if;
  return new;
end;
$$;
create trigger guard_rental_operator_invite before insert or update on public.transport_company_operator_invites for each row execute function public.guard_rental_operator_invite();

create or replace function public.save_transport_rental(p_fleet_id uuid, p_details jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare f public.transport_company_fleets; result_id uuid; v_status text; v_lat double precision; v_lng double precision;
begin
  select * into f from public.transport_company_fleets where id = p_fleet_id for update;
  if not found or not public.can_manage_transport_rentals(f.company_id) then raise exception 'Only the company owner or an active admin can manage rentals.'; end if;
  if f.service_category <> 'Rental' then raise exception 'Select Rental as this fleet service category first.'; end if;
  v_status := coalesce(p_details->>'status','hidden');
  v_lat := nullif(p_details->>'latitude','')::double precision;
  v_lng := nullif(p_details->>'longitude','')::double precision;
  if v_status <> 'hidden' and (
    length(btrim(coalesce(p_details->>'title',''))) = 0 or length(btrim(coalesce(p_details->>'terms',''))) = 0
    or length(btrim(coalesce(p_details->>'pickup_address',''))) = 0
    or v_lat is null or v_lng is null or jsonb_array_length(coalesce(p_details->'photos','[]'::jsonb)) = 0
    or not (coalesce(nullif(p_details->>'hourly_rate','')::numeric,0) > 0 or coalesce(nullif(p_details->>'daily_rate','')::numeric,0) > 0 or coalesce(nullif(p_details->>'weekly_rate','')::numeric,0) > 0)
  ) then raise exception 'Add a title, photo, positive rental rate, rental conditions, and confirmed pickup pin before publishing.'; end if;
  insert into public.transport_company_rentals(company_id,company_fleet_id,title,specifications,photos,currency,hourly_rate,daily_rate,weekly_rate,deposit,terms,pickup_address,latitude,longitude,status)
  values(f.company_id,f.id,btrim(coalesce(p_details->>'title',f.fleet_name)),coalesce(p_details->>'specifications',''),
    array(select jsonb_array_elements_text(coalesce(p_details->'photos','[]'::jsonb))), upper(coalesce(nullif(p_details->>'currency',''),'SLE')),
    nullif(p_details->>'hourly_rate','')::numeric,nullif(p_details->>'daily_rate','')::numeric,nullif(p_details->>'weekly_rate','')::numeric,
    coalesce(nullif(p_details->>'deposit','')::numeric,0),coalesce(p_details->>'terms',''),coalesce(p_details->>'pickup_address',''),v_lat,v_lng,v_status)
  on conflict(company_fleet_id) do update set title=excluded.title,specifications=excluded.specifications,photos=excluded.photos,currency=excluded.currency,
    hourly_rate=excluded.hourly_rate,daily_rate=excluded.daily_rate,weekly_rate=excluded.weekly_rate,deposit=excluded.deposit,terms=excluded.terms,
    pickup_address=excluded.pickup_address,latitude=excluded.latitude,longitude=excluded.longitude,status=excluded.status,updated_at=now()
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.request_transport_rental(p_rental_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_rate_unit text,p_customer_name text,p_contact_phone text,p_note text default '')
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v public.transport_company_rentals; rate numeric; unit_seconds numeric; result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to request a rental.'; end if;
  select * into v from public.transport_company_rentals where id=p_rental_id for update;
  if not found or v.status <> 'available' then raise exception 'This vehicle is not available for rental requests.'; end if;
  if public.can_manage_transport_rentals(v.company_id) then raise exception 'Use company management to manage this rental.'; end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at < now() or p_ends_at <= p_starts_at then raise exception 'Choose a future pickup and a later return time.'; end if;
  if length(btrim(coalesce(p_customer_name,''))) < 2 or length(btrim(coalesce(p_contact_phone,''))) < 5 then raise exception 'Enter your name and a contact phone number.'; end if;
  if exists(select 1 from public.transport_rental_reservations where rental_id=v.id and status in ('confirmed','active') and starts_at < p_ends_at and ends_at > p_starts_at) then raise exception 'This vehicle is already reserved during those dates.'; end if;
  rate := case p_rate_unit when 'hour' then v.hourly_rate when 'day' then v.daily_rate when 'week' then v.weekly_rate end;
  unit_seconds := case p_rate_unit when 'hour' then 3600 when 'day' then 86400 when 'week' then 604800 end;
  if rate is null or rate <= 0 then raise exception 'Select an available rental rate.'; end if;
  insert into public.transport_rental_reservations(rental_id,customer_user_id,starts_at,ends_at,rate_unit,total_price,deposit,currency,customer_name,contact_phone,note,terms_snapshot)
  values(v.id,auth.uid(),p_starts_at,p_ends_at,p_rate_unit,ceil(extract(epoch from (p_ends_at-p_starts_at))/unit_seconds)*rate,v.deposit,v.currency,btrim(p_customer_name),btrim(p_contact_phone),coalesce(p_note,''),v.terms) returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.update_transport_rental_reservation(p_reservation_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare b public.transport_rental_reservations; v public.transport_company_rentals; manager boolean;
begin
  -- Always lock rental before reservation, matching request and date guard order.
  select r.* into v from public.transport_company_rentals r join public.transport_rental_reservations booking on booking.rental_id=r.id where booking.id=p_reservation_id for update of r;
  if not found then raise exception 'Reservation not found.'; end if;
  select * into b from public.transport_rental_reservations where id=p_reservation_id for update;
  manager := public.can_manage_transport_rentals(v.company_id);
  if auth.uid() is null or not (manager or b.customer_user_id=auth.uid()) then raise exception 'You cannot manage this reservation.'; end if;
  if not manager and not (p_status='cancelled' and b.status in ('requested','confirmed') and b.starts_at > now()) then raise exception 'Contact the company to change an active rental.'; end if;
  if not ((b.status='requested' and p_status in ('confirmed','declined','cancelled')) or (b.status='confirmed' and p_status in ('active','cancelled')) or (b.status='active' and p_status='completed')) then raise exception 'This reservation has already changed. Refresh and try again.'; end if;
  if p_status='confirmed' and (v.status <> 'available' or b.starts_at < now()) then raise exception 'Only an available vehicle with future pickup dates can be confirmed.'; end if;
  update public.transport_rental_reservations set status=p_status,managed_by=auth.uid(),updated_at=now() where id=b.id;
  return b.id;
end;
$$;

alter table public.transport_company_rentals enable row level security;
alter table public.transport_rental_reservations enable row level security;
create policy rental_read on public.transport_company_rentals for select using (
  status <> 'hidden' or public.can_manage_transport_rentals(company_id)
  or exists(select 1 from public.transport_rental_reservations where rental_id=transport_company_rentals.id and customer_user_id=auth.uid())
);
-- A security-definer authorization helper avoids reciprocal RLS recursion.
create or replace function public.can_manage_transport_rental(p_rental_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.can_manage_transport_rentals(company_id) from public.transport_company_rentals where id=p_rental_id;
$$;
create policy rental_reservation_read on public.transport_rental_reservations for select using (customer_user_id=auth.uid() or public.can_manage_transport_rental(rental_id));
revoke all on public.transport_company_rentals,public.transport_rental_reservations from public,anon,authenticated;
grant select on public.transport_company_rentals to anon,authenticated;
grant select on public.transport_rental_reservations to authenticated;

create or replace function public.list_transport_rentals(p_rental_id uuid default null,p_company_id uuid default null,p_country text default null)
returns setof jsonb language sql stable security definer set search_path = public, auth as $$
 select to_jsonb(r) || jsonb_build_object('company_name',c.company_name,'company_phone',c.phone,'company_email',c.email,'company_country',c.country,'company_city',c.city,'can_manage',public.can_manage_transport_rentals(r.company_id))
 from public.transport_company_rentals r join public.transport_companies c on c.id=r.company_id
 where (p_rental_id is null or r.id=p_rental_id) and (p_company_id is null or r.company_id=p_company_id)
 and (p_country is null or c.country=p_country)
 and (r.status <> 'hidden' or public.can_manage_transport_rentals(r.company_id) or exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.customer_user_id=auth.uid()))
 order by r.created_at desc limit 200;
$$;

create or replace function public.notify_transport_rental_reservation()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v public.transport_company_rentals; recipient uuid; notice_body text;
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 select * into v from public.transport_company_rentals where id=new.rental_id;
 notice_body := v.title || ': rental ' || replace(new.status,'_',' ') || '. ' || to_char(new.starts_at,'DD Mon YYYY HH24:MI TZ') || ' to ' || to_char(new.ends_at,'DD Mon YYYY HH24:MI TZ') || '.';
 for recipient in select distinct user_id from (
   select new.customer_user_id user_id
   union select owner_user_id from public.transport_companies where id=v.company_id
   union select user_id from public.transport_company_members where company_id=v.company_id and role='admin' and status='active' and coalesce(service_status,'active')='active'
 ) recipients where user_id is not null and user_id is distinct from auth.uid()
 loop
   insert into public.platform_notifications(user_id,sector,notification_type,title,body,priority,status,category,workspace,workspace_id,action_target,action_data,channels,presentation,dedupe_key)
   values(recipient,'transport','urride_rental_'||new.status,'UrRide rental update',notice_body,'high','unread','transport','transport',v.company_id,
     'urride:rental:'||v.id,jsonb_build_object('rentalId',v.id,'reservationId',new.id),array['in_app','push']::text[],'floating','rental:'||new.id||':'||new.status)
   on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
 end loop;
 return new;
end;
$$;
create trigger notify_transport_rental_reservation after insert or update on public.transport_rental_reservations for each row execute function public.notify_transport_rental_reservation();

revoke all on function public.save_transport_rental(uuid,jsonb),public.request_transport_rental(uuid,timestamptz,timestamptz,text,text,text,text),public.update_transport_rental_reservation(uuid,text) from public,anon;
grant execute on function public.save_transport_rental(uuid,jsonb),public.request_transport_rental(uuid,timestamptz,timestamptz,text,text,text,text),public.update_transport_rental_reservation(uuid,text) to authenticated;
grant execute on function public.list_transport_rentals(uuid,uuid,text) to anon,authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='transport_company_rentals') then
      alter publication supabase_realtime add table public.transport_company_rentals;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='transport_rental_reservations') then
      alter publication supabase_realtime add table public.transport_rental_reservations;
    end if;
  end if;
end $$;
commit;

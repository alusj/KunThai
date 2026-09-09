-- One rental record per registered fleet, with availability, reviews and history.
begin;
alter table public.transport_company_rentals add column if not exists deleted_at timestamptz;

create or replace function public.sync_registered_rental_fleet()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare c public.transport_companies; details jsonb; pics text[];
begin
  if new.service_category <> 'Rental' then return new; end if;
  select * into c from public.transport_companies where id=new.company_id;
  details := coalesce(new.safety_answers,'{}'::jsonb);
  select coalesce(array_agg(url order by ordinal),'{}') into pics from (
    select coalesce(photo->>'url',photo->>'publicUrl',photo->>'fileUrl',case when jsonb_typeof(photo)='string' then photo#>>'{}' end) url, ordinal
    from jsonb_array_elements(coalesce(new.public_fleet_photos,'[]'::jsonb)) with ordinality as p(photo,ordinal)
  ) p where nullif(url,'') is not null;
  insert into public.transport_company_rentals(company_id,company_fleet_id,title,specifications,photos,currency,hourly_rate,distance_rate,time_negotiable,distance_negotiable,deposit,terms,pickup_address,latitude,longitude,status)
  values(new.company_id,new.id,coalesce(nullif(new.fleet_name,''),new.fleet_code),concat_ws(' · ',new.make,new.model,new.manufacture_year,new.color),pics,
    coalesce(nullif(details->>'rentalCurrency',''),case lower(c.country) when 'ghana' then 'GHS' when 'nigeria' then 'NGN' when 'liberia' then 'LRD' when 'gambia' then 'GMD' when 'guinea' then 'GNF' when 'senegal' then 'XOF' when 'guinea-bissau' then 'XOF' when 'ivory coast' then 'XOF' else 'SLE' end),nullif(new.price_per_hour,0),nullif(new.price_per_km,0),
    coalesce((details->>'rentalTimeNegotiable')::boolean,false),coalesce((details->>'rentalDistanceNegotiable')::boolean,false),
    coalesce(nullif(details->>'rentalDeposit','')::numeric,0),coalesce(details->>'rentalTerms',''),
    coalesce(details#>>'{rentalPickup,address}',new.home_base_location,c.address,''),
    coalesce(nullif(details#>>'{rentalPickup,latitude}','')::double precision,case when coalesce(nullif(new.home_base_location,''),c.address)=c.address then c.latitude end),
    coalesce(nullif(details#>>'{rentalPickup,longitude}','')::double precision,case when coalesce(nullif(new.home_base_location,''),c.address)=c.address then c.longitude end),'hidden')
  on conflict(company_fleet_id) do nothing;
  if tg_op='UPDATE' then
    update public.transport_company_rentals set
      title=case when new.fleet_name is distinct from old.fleet_name then coalesce(nullif(new.fleet_name,''),new.fleet_code) else title end,
      specifications=case when row(new.make,new.model,new.manufacture_year,new.color) is distinct from row(old.make,old.model,old.manufacture_year,old.color) then concat_ws(' · ',new.make,new.model,new.manufacture_year,new.color) else specifications end,
      photos=case when new.public_fleet_photos is distinct from old.public_fleet_photos then pics else photos end,
      hourly_rate=case when new.price_per_hour is distinct from old.price_per_hour then nullif(new.price_per_hour,0) else hourly_rate end,
      distance_rate=case when new.price_per_km is distinct from old.price_per_km then nullif(new.price_per_km,0) else distance_rate end,
      terms=case when details->>'rentalTerms' is distinct from old.safety_answers->>'rentalTerms' then coalesce(details->>'rentalTerms','') else terms end,
      deposit=case when details->>'rentalDeposit' is distinct from old.safety_answers->>'rentalDeposit' then coalesce(nullif(details->>'rentalDeposit','')::numeric,0) else deposit end,
      time_negotiable=case when details->>'rentalTimeNegotiable' is distinct from old.safety_answers->>'rentalTimeNegotiable' then coalesce((details->>'rentalTimeNegotiable')::boolean,false) else time_negotiable end,
      distance_negotiable=case when details->>'rentalDistanceNegotiable' is distinct from old.safety_answers->>'rentalDistanceNegotiable' then coalesce((details->>'rentalDistanceNegotiable')::boolean,false) else distance_negotiable end,
      pickup_address=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then coalesce(details#>>'{rentalPickup,address}','') else pickup_address end,
      latitude=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then nullif(details#>>'{rentalPickup,latitude}','')::double precision else latitude end,
      longitude=case when details->'rentalPickup' is distinct from old.safety_answers->'rentalPickup' then nullif(details#>>'{rentalPickup,longitude}','')::double precision else longitude end,
      updated_at=now()
    where company_fleet_id=new.id and deleted_at is null;
  end if;
  return new;
end;
$$;
create trigger sync_registered_rental_fleet after insert or update on public.transport_company_fleets for each row execute function public.sync_registered_rental_fleet();
-- Backfill existing fleets without requiring another user save.
update public.transport_company_fleets set updated_at=updated_at where service_category='Rental';

create or replace function public.set_transport_rental_availability(p_rental_id uuid,p_available boolean)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals;
begin
  select * into r from public.transport_company_rentals where id=p_rental_id;
  if not found or not public.can_manage_transport_rentals(r.company_id) then raise exception 'Only the owner or an active admin can change availability.'; end if;
  perform id from public.transport_company_fleets where id=r.company_fleet_id for update;
  select * into r from public.transport_company_rentals where id=p_rental_id for update;
  if r.deleted_at is not null then raise exception 'This fleet has been deleted.'; end if;
  if p_available is null then raise exception 'Choose an availability setting.'; end if;
  -- Reuse all publication validation; turning off never cancels reservations.
  perform public.save_transport_rental(r.company_fleet_id,to_jsonb(r)||jsonb_build_object('status',case when p_available then 'available' else 'hidden' end));
end;
$$;

create or replace function public.delete_transport_rental_fleet(p_rental_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals;
begin
  select * into r from public.transport_company_rentals where id=p_rental_id for update;
  if not found or not public.can_manage_transport_rentals(r.company_id) then raise exception 'Only the owner or an active admin can delete rental fleets.'; end if;
  if exists(select 1 from public.transport_rental_reservations where rental_id=r.id and status in ('requested','confirmed','active')) then raise exception 'Resolve open requests and rentals before deleting this fleet.'; end if;
  update public.transport_company_rentals set deleted_at=now(),status='hidden',updated_at=now() where id=r.id;
end;
$$;

create or replace function public.check_transport_rental_availability(p_rental_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns boolean language plpgsql stable security definer set search_path=public,auth as $$
begin
  if p_starts_at is null or p_ends_at is null or p_starts_at < now() or p_ends_at <= p_starts_at then raise exception 'Choose a future pickup and a later return time.'; end if;
  return exists(select 1 from public.transport_company_rentals where id=p_rental_id and status='available' and deleted_at is null)
    and not exists(select 1 from public.transport_rental_reservations where rental_id=p_rental_id and status in ('confirmed','active') and starts_at < p_ends_at and ends_at > p_starts_at);
end;
$$;

create or replace function public.list_transport_rentals(p_rental_id uuid default null,p_company_id uuid default null,p_country text default null)
returns setof jsonb language sql stable security definer set search_path=public,auth as $$
 select to_jsonb(r)||jsonb_build_object('company_name',c.company_name,'company_phone',c.phone,'company_email',c.email,'company_country',c.country,'company_city',c.city,'can_manage',public.can_manage_transport_rentals(r.company_id))
 from public.transport_company_rentals r join public.transport_companies c on c.id=r.company_id
 where (p_rental_id is null or r.id=p_rental_id) and (p_company_id is null or r.company_id=p_company_id) and (p_country is null or c.country=p_country)
 and ((r.status='available' and r.deleted_at is null)
   or (p_company_id is not null and public.can_manage_transport_rentals(r.company_id))
   or (p_rental_id is not null and (public.can_manage_transport_rentals(r.company_id) or exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.customer_user_id=auth.uid()))))
 order by r.created_at desc limit 200;
$$;
drop policy rental_read on public.transport_company_rentals;
create policy rental_read on public.transport_company_rentals for select using (
 (status='available' and deleted_at is null) or public.can_manage_transport_rentals(company_id)
 or exists(select 1 from public.transport_rental_reservations where rental_id=transport_company_rentals.id and customer_user_id=auth.uid())
);

create or replace function public.notify_transport_rental_fleet_change()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare recipient uuid;
begin
 if (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new; end if;
 for recipient in select distinct customer_user_id from public.transport_rental_reservations
 where rental_id=new.id and status in ('requested','confirmed','active') and customer_user_id is distinct from auth.uid()
 loop
   insert into public.platform_notifications(user_id,sector,notification_type,title,body,priority,status,category,workspace,workspace_id,action_target,action_data,channels,presentation)
   values(recipient,'transport','urride_rental_fleet_updated','Rental fleet updated',new.title||': the company updated this vehicle or its availability. Review the details; your reservation conditions remain saved.','high','unread','transport','transport',new.company_id,
     'urride:rental:'||new.id,jsonb_build_object('rentalId',new.id),array['in_app','push']::text[],'floating');
 end loop;
 return new;
end;
$$;
create trigger notify_transport_rental_fleet_change after update on public.transport_company_rentals for each row execute function public.notify_transport_rental_fleet_change();

create table public.transport_rental_reviews (
 id uuid primary key default gen_random_uuid(), rental_id uuid not null references public.transport_company_rentals(id),
 customer_user_id uuid not null references auth.users(id), rating integer not null check(rating between 1 and 5),
 body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default now(),
 unique(rental_id,customer_user_id)
);
alter table public.transport_rental_reviews enable row level security;
revoke all on public.transport_rental_reviews from public,anon,authenticated;
create or replace function public.list_transport_rental_reviews(p_rental_id uuid)
returns table(id uuid,rating integer,body text,created_at timestamptz) language sql stable security definer set search_path=public,auth as $$
 select v.id,v.rating,v.body,v.created_at from public.transport_rental_reviews v
 where v.rental_id=p_rental_id and exists(select 1 from public.list_transport_rentals(p_rental_id,null,null)) order by v.created_at desc;
$$;
create or replace function public.save_transport_rental_review(p_rental_id uuid,p_rating integer,p_body text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals; recipient uuid;
begin
 select * into r from public.transport_company_rentals where id=p_rental_id;
 if auth.uid() is null or public.can_manage_transport_rentals(r.company_id) or not exists(select 1 from public.transport_rental_reservations where rental_id=p_rental_id and customer_user_id=auth.uid() and status='completed') then raise exception 'Complete a rental before reviewing this vehicle.'; end if;
 insert into public.transport_rental_reviews(rental_id,customer_user_id,rating,body) values(p_rental_id,auth.uid(),p_rating,btrim(p_body))
 on conflict(rental_id,customer_user_id) do update set rating=excluded.rating,body=excluded.body;
 for recipient in select owner_user_id from public.transport_companies where id=r.company_id union select user_id from public.transport_company_members where company_id=r.company_id and role='admin' and status='active' and coalesce(service_status,'active')='active'
 loop
   insert into public.platform_notifications(user_id,sector,notification_type,title,body,priority,status,category,workspace,workspace_id,action_target,action_data,channels,presentation)
   values(recipient,'transport','urride_rental_review','Rental review',r.title||' received a renter review.','normal','unread','transport','transport',r.company_id,'urride:rental:'||r.id,jsonb_build_object('rentalId',r.id),array['in_app','push']::text[],'floating');
 end loop;
end;
$$;
revoke all on function public.set_transport_rental_availability(uuid,boolean),public.delete_transport_rental_fleet(uuid),public.save_transport_rental_review(uuid,integer,text) from public,anon;
grant execute on function public.set_transport_rental_availability(uuid,boolean),public.delete_transport_rental_fleet(uuid),public.save_transport_rental_review(uuid,integer,text) to authenticated;
revoke all on function public.check_transport_rental_availability(uuid,timestamptz,timestamptz),public.list_transport_rental_reviews(uuid) from public;
grant execute on function public.check_transport_rental_availability(uuid,timestamptz,timestamptz),public.list_transport_rental_reviews(uuid) to anon,authenticated;

alter table public.transport_rental_reservations drop constraint transport_rental_reservations_total_price_check;
alter table public.transport_rental_reservations add constraint transport_rental_reservations_total_price_check check(total_price >= 0);
alter table public.transport_rental_reservations add column proposed_total numeric(14,2) check(proposed_total > 0);
create or replace function public.request_transport_rental(p_rental_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_rate_unit text,p_customer_name text,p_contact_phone text,p_note text default '')
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v public.transport_company_rentals; rate numeric; unit_seconds numeric; result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to request a rental.'; end if;
  select * into v from public.transport_company_rentals where id=p_rental_id for update;
  if not found or (v.status <> 'available' or v.deleted_at is not null) then raise exception 'This vehicle is not available for rental requests.'; end if;
  if public.can_manage_transport_rentals(v.company_id) then raise exception 'Use company management to manage this rental.'; end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at < now() or p_ends_at <= p_starts_at then raise exception 'Choose a future pickup and a later return time.'; end if;
  if length(btrim(coalesce(p_customer_name,''))) < 2 or length(btrim(coalesce(p_contact_phone,''))) < 5 then raise exception 'Enter your name and a contact phone number.'; end if;
  if exists(select 1 from public.transport_rental_reservations where rental_id=v.id and status in ('confirmed','active') and starts_at < p_ends_at and ends_at > p_starts_at) then raise exception 'This vehicle is already reserved during those dates.'; end if;
  rate := case p_rate_unit when 'hour' then v.hourly_rate when 'day' then v.daily_rate when 'week' then v.weekly_rate end;
  unit_seconds := case p_rate_unit when 'hour' then 3600 when 'day' then 86400 when 'week' then 604800 end;
  if v.time_negotiable or (v.hourly_rate is null and v.daily_rate is null and v.weekly_rate is null) then rate := 0; unit_seconds := 86400; p_rate_unit := 'day'; elsif rate is null or rate <= 0 then raise exception 'Select an available rental rate.'; end if;
  insert into public.transport_rental_reservations(rental_id,customer_user_id,starts_at,ends_at,rate_unit,total_price,deposit,currency,customer_name,contact_phone,note,terms_snapshot)
  values(v.id,auth.uid(),p_starts_at,p_ends_at,p_rate_unit,ceil(extract(epoch from (p_ends_at-p_starts_at))/unit_seconds)*rate,v.deposit,v.currency,btrim(p_customer_name),btrim(p_contact_phone),coalesce(p_note,''),v.terms) returning id into result_id;
  return result_id;
end;
$$;
create or replace function public.notify_transport_rental_reservation()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v public.transport_company_rentals; recipient uuid; notice_body text;
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new; end if;
 select * into v from public.transport_company_rentals where id=new.rental_id;
 notice_body := case when new.proposed_total is not null then 'Price proposal: '||new.currency||' '||new.proposed_total||'. Open your reservation to accept. ' else '' end || v.title || ': rental ' || replace(new.status,'_',' ') || '. ' || to_char(new.starts_at,'DD Mon YYYY HH24:MI TZ') || ' to ' || to_char(new.ends_at,'DD Mon YYYY HH24:MI TZ') || '.';
 for recipient in select distinct user_id from (
   select new.customer_user_id user_id
   union select owner_user_id from public.transport_companies where id=v.company_id
   union select user_id from public.transport_company_members where company_id=v.company_id and role='admin' and status='active' and coalesce(service_status,'active')='active'
 ) recipients where user_id is not null and user_id is distinct from auth.uid()
 loop
   insert into public.platform_notifications(user_id,sector,notification_type,title,body,priority,status,category,workspace,workspace_id,action_target,action_data,channels,presentation,dedupe_key)
   values(recipient,'transport','urride_rental_'||new.status,'UrRide rental update',notice_body,'high','unread','transport','transport',v.company_id,
     'urride:rental:'||v.id,jsonb_build_object('rentalId',v.id,'reservationId',new.id),array['in_app','push']::text[],'floating','rental:'||new.id||':'||md5(to_jsonb(new)::text))
   on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
 end loop;
 return new;
end;
$$;
do $patch$ declare definition text; begin
 if to_regprocedure('public.get_public_transport_company_profile(uuid)') is not null then
   select pg_get_functiondef('public.get_public_transport_company_profile(uuid)'::regprocedure) into definition;
   execute replace(definition, 'rental.status <> ''hidden''', 'rental.status = ''available'' and rental.deleted_at is null');
 end if;
end $patch$;
create or replace function public.guard_rental_price_and_deletion()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
 if new.status in ('confirmed','active') and (new.total_price <= 0 or new.proposed_total is not null) then raise exception 'The renter must accept a price before confirmation.'; end if;
 return new;
end;
$$;
create trigger guard_rental_price before insert or update on public.transport_rental_reservations for each row execute function public.guard_rental_price_and_deletion();
create or replace function public.propose_transport_rental_price(p_reservation_id uuid,p_total numeric)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals; b public.transport_rental_reservations;
begin
 select v.* into r from public.transport_company_rentals v join public.transport_rental_reservations booking on booking.rental_id=v.id where booking.id=p_reservation_id for update of v;
 select * into b from public.transport_rental_reservations where id=p_reservation_id for update;
 if not found or not public.can_manage_transport_rentals(r.company_id) then raise exception 'Only the owner or an active admin can propose a price.'; end if;
 if b.status <> 'requested' or b.total_price > 0 or p_total is null or p_total <= 0 then raise exception 'Choose a positive price for a request awaiting a quote.'; end if;
 update public.transport_rental_reservations set proposed_total=p_total,updated_at=now() where id=b.id;
end;
$$;
create or replace function public.accept_transport_rental_price(p_reservation_id uuid,p_total numeric)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals; b public.transport_rental_reservations;
begin
 select v.* into r from public.transport_company_rentals v join public.transport_rental_reservations booking on booking.rental_id=v.id where booking.id=p_reservation_id for update of v;
 select * into b from public.transport_rental_reservations where id=p_reservation_id for update;
 if not found or auth.uid() is null or b.customer_user_id <> auth.uid() then raise exception 'Only the renter can accept this price.'; end if;
 if b.status <> 'requested' or b.proposed_total is null or p_total is distinct from b.proposed_total then raise exception 'The quote changed. Refresh your reservation.'; end if;
 update public.transport_rental_reservations set total_price=proposed_total,proposed_total=null,updated_at=now() where id=b.id;
end;
$$;
revoke all on function public.propose_transport_rental_price(uuid,numeric),public.accept_transport_rental_price(uuid,numeric) from public,anon;
grant execute on function public.propose_transport_rental_price(uuid,numeric),public.accept_transport_rental_price(uuid,numeric) to authenticated;
-- A deleted fleet cannot be republished through the older edit RPC.
create or replace function public.guard_deleted_rental()
returns trigger language plpgsql as $$ begin
 if old.deleted_at is not null and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'This rental fleet has been deleted.'; end if;
 return new;
end; $$;
create trigger guard_deleted_rental before update on public.transport_company_rentals for each row execute function public.guard_deleted_rental();
commit;

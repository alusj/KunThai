-- Global admin case context and real estate listing visibility.
--
-- Admins need country-aware queues for a global app, while real estate listings
-- must not wait for listing-level admin verification before buyers can see them.

alter table if exists public.admin_cases
  add column if not exists country_iso text,
  add column if not exists country_name text;

create index if not exists admin_cases_country_queue_status_idx
  on public.admin_cases (country_iso, queue, status, created_at desc);

create or replace function public.admin_upsert_source_case(
  source_row jsonb,
  source_resource_type text,
  source_sector text,
  source_queue text,
  source_case_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id uuid;
  source_status text;
  source_title text;
  source_description text;
  source_priority text;
  source_subject uuid;
  source_reporter uuid;
  source_case_id uuid;
  source_business_id uuid;
  source_country_iso text;
  source_country_name text;
begin
  source_id := nullif(source_row ->> 'id', '')::uuid;
  if source_id is null then return null; end if;

  source_status := lower(coalesce(source_row ->> 'status', source_row ->> 'account_status', source_row ->> 'verification_status', 'open'));
  if source_status not in ('new','open','pending','submitted','pending_review','under_review','in_review','verification_pending') then
    return null;
  end if;

  source_title := coalesce(
    nullif(source_row ->> 'title',''),
    nullif(source_row ->> 'subject',''),
    nullif(source_row ->> 'topic',''),
    nullif(source_row ->> 'business_name',''),
    nullif(source_row ->> 'company_name',''),
    nullif(source_row ->> 'full_name',''),
    initcap(replace(source_case_type, '_', ' '))
  );
  source_description := coalesce(
    nullif(source_row ->> 'description',''),
    nullif(source_row ->> 'reason',''),
    nullif(source_row ->> 'body',''),
    nullif(source_row ->> 'message',''),
    nullif(source_row ->> 'note',''),
    ''
  );
  source_priority := lower(coalesce(source_row ->> 'priority', case when source_row ->> 'severity' = 'critical' then 'critical' else 'normal' end));
  if source_priority not in ('low','normal','high','urgent','critical') then source_priority := 'normal'; end if;

  source_subject := nullif(coalesce(source_row ->> 'reported_user_id', source_row ->> 'operator_user_id'), '')::uuid;
  source_reporter := nullif(coalesce(source_row ->> 'reporter_id', source_row ->> 'user_id', source_row ->> 'passenger_id'), '')::uuid;
  source_country_iso := upper(nullif(coalesce(
    source_row ->> 'country_iso',
    source_row ->> 'country_code',
    source_row ->> 'countryCode',
    source_row #>> '{location,country_iso}',
    source_row #>> '{location,countryCode}',
    ''
  ), ''));
  source_country_name := nullif(coalesce(
    source_row ->> 'country_name',
    source_row ->> 'countryName',
    source_row ->> 'country',
    source_row #>> '{location,country_name}',
    source_row #>> '{location,countryName}',
    source_row #>> '{location,country}',
    ''
  ), '');

  if source_reporter is null and source_resource_type in ('marketplace_case','marketplace_verification')
     and to_regclass('public.marketplace_businesses') is not null then
    source_business_id := nullif(source_row ->> 'business_id', '')::uuid;
    if source_business_id is not null then
      select business.user_id, coalesce(source_country_iso, business.country_iso), coalesce(source_country_name, business.country)
      into source_reporter, source_country_iso, source_country_name
      from public.marketplace_businesses business
      where business.id = source_business_id;
    end if;
  end if;

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, subject_user_id, reporter_user_id, country_iso, country_name, sla_due_at, metadata
  ) values (
    source_sector, source_queue, source_case_type, source_resource_type, source_id,
    source_title, source_description, source_priority, source_subject, source_reporter,
    source_country_iso, source_country_name,
    now() + case source_priority
      when 'critical' then interval '30 minutes'
      when 'urgent' then interval '2 hours'
      when 'high' then interval '8 hours'
      when 'low' then interval '72 hours'
      else interval '24 hours'
    end,
    jsonb_build_object('source', source_row)
  )
  on conflict (resource_type, resource_id) do update
  set title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      subject_user_id = coalesce(excluded.subject_user_id, public.admin_cases.subject_user_id),
      reporter_user_id = coalesce(excluded.reporter_user_id, public.admin_cases.reporter_user_id),
      country_iso = coalesce(excluded.country_iso, public.admin_cases.country_iso),
      country_name = coalesce(excluded.country_name, public.admin_cases.country_name),
      metadata = excluded.metadata,
      updated_at = now()
  returning id into source_case_id;

  return source_case_id;
end;
$$;

update public.admin_cases
set country_iso = coalesce(country_iso, upper(nullif(coalesce(
      metadata -> 'source' ->> 'country_iso',
      metadata -> 'source' ->> 'country_code',
      metadata -> 'source' ->> 'countryCode',
      metadata -> 'source' #>> '{location,country_iso}',
      metadata -> 'source' #>> '{location,countryCode}',
      ''
    ), ''))),
    country_name = coalesce(country_name, nullif(coalesce(
      metadata -> 'source' ->> 'country_name',
      metadata -> 'source' ->> 'countryName',
      metadata -> 'source' ->> 'country',
      metadata -> 'source' #>> '{location,country_name}',
      metadata -> 'source' #>> '{location,countryName}',
      metadata -> 'source' #>> '{location,country}',
      ''
    ), ''))
where metadata ? 'source';

do $$
begin
  if to_regclass('public.marketplace_property_listings') is not null then
    drop trigger if exists admin_intake_marketplace_property_listings on public.marketplace_property_listings;

    update public.marketplace_property_listings
    set authorization_status = 'verified'
    where authorization_status = 'pending'
      and published = true;

    update public.admin_cases
    set status = 'resolved',
        resolution_code = coalesce(resolution_code, 'listing_verification_retired'),
        resolution_note = coalesce(nullif(resolution_note, ''), 'Property listings are seller-published. Seller verification remains an account-level admin decision.'),
        updated_at = now()
    where resource_type = 'marketplace_property_listing'
      and status not in ('resolved', 'closed');

    drop policy if exists "buyers read property listings" on public.marketplace_property_listings;
    create policy "buyers read property listings"
    on public.marketplace_property_listings for select to anon, authenticated
    using (published = true and availability_status = 'available' and expires_at > now());
  end if;
end;
$$;

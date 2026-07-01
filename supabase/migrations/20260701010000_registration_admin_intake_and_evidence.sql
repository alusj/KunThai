-- Private registration evidence. Passenger-visible fleet/selfie images remain
-- in transport-public-media; identity and vehicle records belong here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transport-verification-documents',
  'transport-verification-documents',
  false,
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload transport verification documents" on storage.objects;
create policy "owners upload transport verification documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'transport-verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owners read transport verification documents" on storage.objects;
create policy "owners read transport verification documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'transport-verification-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_kunthai_admin()
  )
);

drop policy if exists "owners delete transport verification documents" on storage.objects;
create policy "owners delete transport verification documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'transport-verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Connect every registration source that was missing from the central intake.
do $$
declare
  source record;
begin
  for source in
    select * from (values
      ('nearby_area_locations','admin_intake_area_locations','area_location_verification','transport','verification','area_location_review'),
      ('marketplace_businesses','admin_intake_marketplace_businesses','marketplace_business_registration','marketplace','verification','seller_registration'),
      ('marketplace_business_documents','admin_intake_marketplace_business_documents','marketplace_business_document','marketplace','verification','seller_document')
    ) as configured(table_name, trigger_name, resource_type, sector, queue_name, case_type)
  loop
    if to_regclass('public.' || source.table_name) is not null then
      execute format('drop trigger if exists %I on public.%I', source.trigger_name, source.table_name);
      execute format(
        'create trigger %I after insert or update on public.%I for each row execute function public.admin_capture_source_case(%L,%L,%L,%L)',
        source.trigger_name, source.table_name, source.resource_type, source.sector, source.queue_name, source.case_type
      );
    end if;
  end loop;
end;
$$;

-- Keep parent registration cases supplied with all document rows, so one case
-- contains the full evidence set instead of forcing reviewers to hunt for it.
create or replace function public.admin_refresh_registration_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  evidence jsonb;
begin
  if tg_table_name = 'marketplace_business_documents' then
    select coalesce(jsonb_agg(to_jsonb(document) order by document.created_at), '[]'::jsonb)
      into evidence
    from public.marketplace_business_documents document
    where document.business_id = new.business_id;

    update public.admin_cases
    set metadata = jsonb_set(metadata, '{source,registration_documents}', evidence, true),
        updated_at = now()
    where resource_type = 'marketplace_business_registration'
      and resource_id = new.business_id;
  elsif tg_table_name = 'transport_operator_documents' then
    select coalesce(jsonb_agg(to_jsonb(document) order by document.uploaded_at), '[]'::jsonb)
      into evidence
    from public.transport_operator_documents document
    where document.operator_id = new.operator_id;

    update public.admin_cases
    set metadata = jsonb_set(metadata, '{source,registration_documents}', evidence, true),
        updated_at = now()
    where resource_type = 'transport_operator_verification'
      and resource_id = new.operator_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.marketplace_business_documents') is not null then
    drop trigger if exists admin_refresh_marketplace_registration_evidence on public.marketplace_business_documents;
    create trigger admin_refresh_marketplace_registration_evidence
      after insert or update on public.marketplace_business_documents
      for each row execute function public.admin_refresh_registration_evidence();
  end if;
  if to_regclass('public.transport_operator_documents') is not null then
    drop trigger if exists admin_refresh_transport_registration_evidence on public.transport_operator_documents;
    create trigger admin_refresh_transport_registration_evidence
      after insert or update on public.transport_operator_documents
      for each row execute function public.admin_refresh_registration_evidence();
  end if;
end;
$$;

-- Apply admin decisions to the newly connected registration sources.
create or replace function public.admin_sync_registration_case_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolution_code is null or new.resolution_code is not distinct from old.resolution_code then
    return new;
  end if;

  if new.resource_type = 'area_location_verification'
     and to_regclass('public.nearby_area_locations') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.nearby_area_locations
    set status = case when new.resolution_code = 'approve' then 'approved' else 'rejected' end,
        visibility = case when new.resolution_code = 'approve' then 'public' else 'private' end,
        updated_at = now()
    where id = new.resource_id;
  elsif new.resource_type = 'marketplace_business_registration'
     and to_regclass('public.marketplace_businesses') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.marketplace_businesses
    set verification_status = case when new.resolution_code = 'approve' then 'verified' else 'rejected' end,
        updated_at = now()
    where id = new.resource_id;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_sync_registration_case_decision_trigger on public.admin_cases;
create trigger admin_sync_registration_case_decision_trigger
after update of resolution_code on public.admin_cases
for each row execute function public.admin_sync_registration_case_decision();

-- Backfill current pending registrations and location requests without sending
-- duplicate intake notifications for future records.
do $$
begin
  if to_regclass('public.nearby_area_locations') is not null then
    perform public.admin_upsert_source_case(to_jsonb(location), 'area_location_verification', 'transport', 'verification', 'area_location_review')
    from public.nearby_area_locations location
    where location.status = 'pending';
  end if;
  if to_regclass('public.marketplace_businesses') is not null then
    perform public.admin_upsert_source_case(to_jsonb(business), 'marketplace_business_registration', 'marketplace', 'verification', 'seller_registration')
    from public.marketplace_businesses business
    where business.verification_status in ('pending', 'submitted', 'pending_review', 'under_review');
  end if;
  if to_regclass('public.marketplace_business_documents') is not null then
    perform public.admin_upsert_source_case(to_jsonb(document), 'marketplace_business_document', 'marketplace', 'verification', 'seller_document')
    from public.marketplace_business_documents document;

    update public.admin_cases registration
    set metadata = jsonb_set(
      registration.metadata,
      '{source,registration_documents}',
      coalesce((
        select jsonb_agg(to_jsonb(document) order by document.created_at)
        from public.marketplace_business_documents document
        where document.business_id = registration.resource_id
      ), '[]'::jsonb),
      true
    )
    where registration.resource_type = 'marketplace_business_registration';
  end if;
  if to_regclass('public.transport_operator_documents') is not null then
    update public.admin_cases registration
    set metadata = jsonb_set(
      registration.metadata,
      '{source,registration_documents}',
      coalesce((
        select jsonb_agg(to_jsonb(document) order by document.uploaded_at)
        from public.transport_operator_documents document
        where document.operator_id = registration.resource_id
      ), '[]'::jsonb),
      true
    )
    where registration.resource_type = 'transport_operator_verification';
  end if;
end;
$$;

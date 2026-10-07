-- Red-flag fixes from the 2026-10-07 audit.
--
-- 1. Seller identity and business documents go to a PRIVATE bucket. The public
--    media bucket can no longer be listed by strangers, and owners can delete
--    their own files (business deletion cleans up after itself).
-- 2. Operators and companies cannot mark themselves verified or lift an
--    admin's rejection/suspension by editing their own rows.
-- 3. A removed company member who comes back through an operator invite comes
--    back as an operator, never with their old admin role or permissions.
-- 4. Seller order changes follow the order lifecycle (a buyer's cancellation
--    cannot be overwritten), and only cancelled orders can be deleted.
--
-- Service-role and SQL-editor work (auth.uid() is null) and KunThai admins
-- are not restricted by these guards.

-- ---------------------------------------------------------------------------
-- 1. Seller documents: private bucket, stored by path
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-business-documents',
  'marketplace-business-documents',
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
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners upload marketplace business documents" on storage.objects;
create policy "owners upload marketplace business documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'marketplace-business-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owners read marketplace business documents" on storage.objects;
create policy "owners read marketplace business documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'marketplace-business-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_kunthai_admin())
);

drop policy if exists "owners delete marketplace business documents" on storage.objects;
create policy "owners delete marketplace business documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'marketplace-business-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- The media bucket stays public for logos and product photos (served by public
-- URL, which needs no policy). Listing it through the API is now limited to
-- each owner's own folder, so nobody can enumerate other sellers' files.
drop policy if exists "business owners read marketplace media" on storage.objects;
create policy "business owners read marketplace media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'marketplace-business-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_kunthai_admin())
  );

drop policy if exists "business owners delete marketplace media" on storage.objects;
create policy "business owners delete marketplace media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'marketplace-business-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

alter table if exists public.marketplace_business_documents
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_path text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Verification and account status are decided by KunThai admins
-- ---------------------------------------------------------------------------

create or replace function public.kunthai_can_review_transport()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return true; end if;
  return coalesce(public.admin_has_permission('transport.verify', 'transport'), false);
exception when undefined_function then
  return coalesce(public.is_kunthai_admin(), false);
end;
$$;

-- Passenger-facing fleets. A company runtime fleet always mirrors its company
-- fleet's review; a solo fleet can move only between its own unreviewed
-- states (not verified <-> pending) and can never become or stop being
-- verified by itself.
create or replace function public.guard_transport_fleet_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_fleet_status text;
begin
  -- Fleets are updated constantly (location, availability); only writes that
  -- touch verification or the company link need checking.
  if tg_op = 'UPDATE'
    and new.verification_status is not distinct from old.verification_status
    and new.company_fleet_id is not distinct from old.company_fleet_id then
    return new;
  end if;
  if public.kunthai_can_review_transport() then return new; end if;

  if new.company_fleet_id is not null then
    select verification_status into company_fleet_status
    from public.transport_company_fleets where id = new.company_fleet_id;
    new.verification_status := (case company_fleet_status
      when 'verified' then 'verified'
      when 'rejected' then 'not_verified'
      when 'suspended' then 'not_verified'
      else 'verification_pending'
    end)::public.transport_verification_status;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status::text = 'verified' then
      new.verification_status := 'verification_pending'::public.transport_verification_status;
    end if;
    return new;
  end if;

  if old.verification_status::text = 'verified' or new.verification_status::text = 'verified' then
    new.verification_status := old.verification_status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_transport_fleet_verification_trigger on public.transport_fleets;
create trigger guard_transport_fleet_verification_trigger
before insert or update on public.transport_fleets
for each row execute function public.guard_transport_fleet_verification();

-- New operator profiles cannot be created already verified or approved
-- (updates are already guarded by guard_transport_operator_admin_fields).
create or replace function public.guard_transport_operator_insert_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.kunthai_can_review_transport() then return new; end if;
  if new.verification_status::text = 'verified' then
    new.verification_status := 'verification_pending'::public.transport_verification_status;
  end if;
  if coalesce(new.account_status, '') in ('approved', 'rejected', 'suspended') then
    new.account_status := 'submitted';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_transport_operator_insert_status_trigger on public.transport_operators;
create trigger guard_transport_operator_insert_status_trigger
before insert on public.transport_operators
for each row execute function public.guard_transport_operator_insert_status();

-- Companies: the owner moves between draft / submitted / archived; approval,
-- rejection and suspension (and the review notes) belong to admins, and a
-- rejected or suspended company stays that way until an admin changes it.
create or replace function public.guard_transport_company_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_states constant text[] := array['approved', 'rejected', 'suspended'];
  verdict_states constant text[] := array['verified', 'rejected', 'suspended'];
begin
  if public.kunthai_can_review_transport() then return new; end if;

  if tg_op = 'INSERT' then
    if new.verification_status = any(verdict_states) then new.verification_status := 'pending'; end if;
    if new.account_status = any(admin_states) then new.account_status := 'submitted'; end if;
    return new;
  end if;

  if old.verification_status = any(verdict_states) or new.verification_status = any(verdict_states) then
    new.verification_status := old.verification_status;
  end if;
  if old.account_status = any(admin_states) or new.account_status = any(admin_states) then
    new.account_status := old.account_status;
  end if;
  -- Review notes stay as the admin left them (keys for columns a database
  -- does not have are ignored).
  new := jsonb_populate_record(new, jsonb_build_object(
    'admin_note', to_jsonb(old) -> 'admin_note',
    'rejection_reason', to_jsonb(old) -> 'rejection_reason',
    'reviewed_by', to_jsonb(old) -> 'reviewed_by',
    'reviewed_at', to_jsonb(old) -> 'reviewed_at'
  ));
  return new;
end;
$$;

drop trigger if exists guard_transport_company_review_fields_trigger on public.transport_companies;
create trigger guard_transport_company_review_fields_trigger
before insert or update on public.transport_companies
for each row execute function public.guard_transport_company_review_fields();

create or replace function public.guard_transport_company_fleet_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  verdict_states constant text[] := array['verified', 'rejected', 'suspended'];
begin
  if tg_op = 'UPDATE' and new.verification_status is not distinct from old.verification_status then return new; end if;
  if public.kunthai_can_review_transport() then return new; end if;
  if tg_op = 'INSERT' then
    if new.verification_status = any(verdict_states) then new.verification_status := 'pending_review'; end if;
    return new;
  end if;
  if old.verification_status = any(verdict_states) or new.verification_status = any(verdict_states) then
    new.verification_status := old.verification_status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_transport_company_fleet_verification_trigger on public.transport_company_fleets;
create trigger guard_transport_company_fleet_verification_trigger
before insert or update on public.transport_company_fleets
for each row execute function public.guard_transport_company_fleet_verification();

-- ---------------------------------------------------------------------------
-- 3. Re-joining after removal starts as an operator
-- ---------------------------------------------------------------------------

create or replace function public.transport_company_sync_operator_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_joining boolean;
  v_rejoining_after_removal boolean := false;
begin
  if new.status <> 'accepted' then return new; end if;
  v_user := new.operator_user_id;
  if v_user is null then select user_id into v_user from public.transport_operators where id = new.operator_id; end if;
  if v_user is null then return new; end if;
  v_joining := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then v_joining := old.status <> 'accepted'; end if;

  -- Someone the company removed comes back through an operator invite as an
  -- operator: their earlier admin/manager role and permissions stay gone.
  if v_joining then
    select coalesce(member.role <> 'owner'
        and (member.status = 'removed' or coalesce(member.service_status, '') = 'removed'), false)
    into v_rejoining_after_removal
    from public.transport_company_members member
    where member.company_id = new.company_id and member.user_id = v_user;
    v_rejoining_after_removal := coalesce(v_rejoining_after_removal, false);
  end if;

  insert into public.transport_company_members (company_id, user_id, operator_id, public_id, full_name, role, status, service_status, joined_at, updated_at)
  values (new.company_id, v_user, new.operator_id, new.operator_public_id, new.operator_name, 'operator', 'active', 'active', coalesce(new.responded_at, now()), now())
  on conflict (company_id, user_id) do update set
    operator_id = coalesce(excluded.operator_id, transport_company_members.operator_id),
    public_id = coalesce(nullif(excluded.public_id, ''), transport_company_members.public_id),
    full_name = coalesce(nullif(excluded.full_name, ''), transport_company_members.full_name),
    role = case when v_rejoining_after_removal then 'operator' else transport_company_members.role end,
    status = case when v_joining and transport_company_members.role <> 'owner' then 'active' else transport_company_members.status end,
    service_status = case when v_joining and transport_company_members.role <> 'owner' then 'active' else transport_company_members.service_status end,
    joined_at = coalesce(transport_company_members.joined_at, excluded.joined_at), updated_at = now();

  if v_rejoining_after_removal then
    -- Separate statement so this also runs where these columns were never added.
    begin
      update public.transport_company_members member
      set permissions = '{}'::jsonb, responsibilities = '{}'::text[]
      where member.company_id = new.company_id and member.user_id = v_user;
    exception when undefined_column then null;
    end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Seller order lifecycle and deletion
-- ---------------------------------------------------------------------------

-- pending -> shipped / completed / cancelled, shipped -> completed / cancelled.
-- Completed, cancelled and refunded are final for sellers and buyers.
create or replace function public.guard_marketplace_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if auth.uid() is null or public.is_kunthai_admin() then return new; end if;
  if (old.status = 'pending' and new.status in ('shipped', 'completed', 'cancelled'))
    or (old.status = 'shipped' and new.status in ('completed', 'cancelled')) then
    return new;
  end if;
  raise exception 'This order is % and cannot be changed to %.', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists marketplace_orders_status_transition_guard on public.marketplace_orders;
create trigger marketplace_orders_status_transition_guard
before update of status on public.marketplace_orders
for each row execute function public.guard_marketplace_order_status_transition();

-- The owners' all-in-one policy allowed deleting any order (including completed
-- ones that buyers' reviews depend on). Split it; owners may delete only
-- cancelled orders. Business deletion still removes every order (cascade).
drop policy if exists "business owners manage orders" on public.marketplace_orders;

drop policy if exists "business owners read orders" on public.marketplace_orders;
create policy "business owners read orders" on public.marketplace_orders
  for select using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

drop policy if exists "business owners create orders" on public.marketplace_orders;
create policy "business owners create orders" on public.marketplace_orders
  for insert with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

drop policy if exists "business owners update orders" on public.marketplace_orders;
create policy "business owners update orders" on public.marketplace_orders
  for update
  using (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid()));

drop policy if exists "business owners delete cancelled orders" on public.marketplace_orders;
create policy "business owners delete cancelled orders" on public.marketplace_orders
  for delete using (
    status = 'cancelled'
    and exists (select 1 from public.marketplace_businesses b where b.id = business_id and b.user_id = auth.uid())
  );

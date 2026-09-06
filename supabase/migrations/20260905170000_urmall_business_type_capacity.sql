-- The highest unexpired plan on an OWNED UrMall business unlocks distinct
-- business types for that owner. Inventory/billing remain per business.
begin;

alter table public.kunthai_business_plans add column if not exists business_type_limit integer;
update public.kunthai_business_plans
set business_type_limit = case plan_code when 'premium' then 4 when 'pro' then 2 else 1 end
where surface = 'urmall';

create or replace function public.get_my_urmall_business_type_capacity()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_plan text := 'free';
  v_limit integer := 1;
  v_business uuid;
  v_kinds text[];
begin
  if v_user is null then raise exception 'Sign in to manage business types.'; end if;
  select s.plan_code, b.id into v_plan, v_business
  from public.marketplace_businesses b
  join public.kunthai_business_subscriptions s on s.marketplace_business_id = b.id and s.surface = 'urmall'
  where b.user_id = v_user and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
  order by case s.plan_code when 'premium' then 4 when 'pro' then 2 else 1 end desc, b.created_at, b.id limit 1;
  v_plan := coalesce(v_plan, 'free');
  v_limit := case v_plan when 'premium' then 4 when 'pro' then 2 else 1 end;
  if v_business is null then
    select id into v_business from public.marketplace_businesses where user_id = v_user order by created_at, id limit 1;
  end if;
  select coalesce(array_agg(distinct case when business_kind = 'hotel' then 'property_agent' else coalesce(business_kind, 'retail') end), '{}'::text[])
    into v_kinds from public.marketplace_businesses where user_id = v_user;
  return jsonb_build_object('plan_code', v_plan, 'limit', v_limit, 'used_kinds', v_kinds, 'upgrade_business_id', v_business);
end;
$$;
revoke all on function public.get_my_urmall_business_type_capacity() from public, anon;
grant execute on function public.get_my_urmall_business_type_capacity() to authenticated;

create or replace function public.kunthai_guard_urmall_business_type_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
  v_kind text := case when new.business_kind = 'hotel' then 'property_agent' else coalesce(new.business_kind, 'retail') end;
  v_exclude uuid;
begin
  if tg_op = 'UPDATE' then
    -- Business editors may update identity details, never take ownership of
    -- another account's business (and its paid entitlement).
    if new.user_id is distinct from old.user_id and auth.uid() is not null then
      raise exception 'Business ownership cannot be changed from a client session.';
    end if;
    if new.user_id is not distinct from old.user_id and new.business_kind is not distinct from old.business_kind then return new; end if;
    v_exclude := old.id;
  end if;
  -- Serialise competing creations for the same owner; two concurrent tabs
  -- cannot each take the last remaining type slot.
  perform pg_advisory_xact_lock(hashtextextended('urmall-business-types:' || new.user_id::text, 0));
  select s.plan_code into v_plan
  from public.marketplace_businesses b
  join public.kunthai_business_subscriptions s on s.marketplace_business_id = b.id and s.surface = 'urmall'
  where b.user_id = new.user_id and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
  order by case s.plan_code when 'premium' then 4 when 'pro' then 2 else 1 end desc limit 1;
  v_limit := case v_plan when 'premium' then 4 when 'pro' then 2 else 1 end;
  if exists (select 1 from public.marketplace_businesses b where b.user_id = new.user_id
    and (v_exclude is null or b.id <> v_exclude)
    and (case when b.business_kind = 'hotel' then 'property_agent' else coalesce(b.business_kind, 'retail') end) = v_kind) then
    raise exception 'You already have this business type. Open its workspace to add locations or inventory.';
  end if;
  select count(distinct case when business_kind = 'hotel' then 'property_agent' else coalesce(business_kind, 'retail') end)
    into v_count from public.marketplace_businesses where user_id = new.user_id and (v_exclude is null or id <> v_exclude);
  if v_count >= v_limit then
    raise exception 'Your % plan allows % business type(s). Upgrade to % to add another type.',
      coalesce(v_plan, 'free'), v_limit, case when v_count < 2 then 'Pro' else 'Premium' end;
  end if;
  return new;
end;
$$;
revoke all on function public.kunthai_guard_urmall_business_type_capacity() from public, anon, authenticated;
drop trigger if exists kunthai_guard_urmall_business_types on public.marketplace_businesses;
create trigger kunthai_guard_urmall_business_types before insert or update of user_id, business_kind on public.marketplace_businesses
for each row execute function public.kunthai_guard_urmall_business_type_capacity();
commit;

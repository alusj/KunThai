-- Visibility credits, referral tasks, and non-payment promotion controls.
-- Credits are earned through verified platform actions, not by collecting a
-- payment method. Promotions can activate immediately when the seller has
-- enough credits, or stay pending until the referral task is completed.

create table if not exists public.visibility_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  starter_awarded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visibility_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  balance_after integer not null default 0,
  reason text not null,
  surface text not null default 'platform',
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.referral_invite_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  surface text not null default 'platform',
  resource_id uuid,
  required_invites integer not null default 5 check (required_invites >= 1),
  verified_invites integer not null default 0 check (verified_invites >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.referral_invite_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.referral_invite_links(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid references auth.users(id) on delete set null,
  code text not null,
  status text not null default 'clicked' check (status in ('clicked', 'joined', 'verified', 'rejected')),
  fraud_status text not null default 'unchecked' check (fraud_status in ('unchecked', 'clear', 'suspicious', 'blocked')),
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz
);

create index if not exists visibility_credit_transactions_user_idx
  on public.visibility_credit_transactions (user_id, created_at desc);
create index if not exists referral_invite_links_user_surface_idx
  on public.referral_invite_links (user_id, surface, status, created_at desc);
create index if not exists referral_invite_events_link_status_idx
  on public.referral_invite_events (link_id, status, created_at desc);

alter table public.visibility_credit_wallets enable row level security;
alter table public.visibility_credit_transactions enable row level security;
alter table public.referral_invite_links enable row level security;
alter table public.referral_invite_events enable row level security;

drop policy if exists "Users read own visibility wallet" on public.visibility_credit_wallets;
create policy "Users read own visibility wallet"
on public.visibility_credit_wallets for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own visibility transactions" on public.visibility_credit_transactions;
create policy "Users read own visibility transactions"
on public.visibility_credit_transactions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own referral links" on public.referral_invite_links;
create policy "Users read own referral links"
on public.referral_invite_links for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Public can resolve active referral links" on public.referral_invite_links;
create policy "Public can resolve active referral links"
on public.referral_invite_links for select to anon, authenticated
using (status = 'active');

drop policy if exists "Users read own referral events" on public.referral_invite_events;
create policy "Users read own referral events"
on public.referral_invite_events for select to authenticated
using (referrer_id = auth.uid() or invitee_id = auth.uid());

create or replace function public.ensure_visibility_wallet(p_surface text default 'platform')
returns public.visibility_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.visibility_credit_wallets;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in to use visibility credits.';
  end if;

  insert into public.visibility_credit_wallets (
    user_id, balance, lifetime_earned, starter_awarded_at
  ) values (
    v_user_id, 5, 5, timezone('utc', now())
  )
  on conflict (user_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count > 0 then
    insert into public.visibility_credit_transactions (
      user_id, amount, balance_after, reason, surface, metadata
    ) values (
      v_user_id, 5, 5, 'starter_bonus', coalesce(nullif(btrim(p_surface), ''), 'platform'),
      jsonb_build_object('label', 'Starter visibility credits')
    );
  else
    update public.visibility_credit_wallets
    set balance = balance + 5,
        lifetime_earned = lifetime_earned + 5,
        starter_awarded_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where user_id = v_user_id
      and starter_awarded_at is null
    returning * into v_wallet;

    if found then
      insert into public.visibility_credit_transactions (
        user_id, amount, balance_after, reason, surface, metadata
      ) values (
        v_user_id, 5, v_wallet.balance, 'starter_bonus',
        coalesce(nullif(btrim(p_surface), ''), 'platform'),
        jsonb_build_object('label', 'Starter visibility credits')
      );
    end if;
  end if;

  select * into v_wallet
  from public.visibility_credit_wallets
  where user_id = v_user_id;

  return v_wallet;
end;
$$;

create or replace function public.create_referral_invite_link(
  p_surface text default 'platform',
  p_resource_id uuid default null,
  p_required_invites integer default 5
)
returns public.referral_invite_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_surface text := lower(coalesce(nullif(btrim(p_surface), ''), 'platform'));
  v_required integer := greatest(1, coalesce(p_required_invites, 5));
  v_link public.referral_invite_links;
begin
  if v_user_id is null then
    raise exception 'Sign in to create an invite task.';
  end if;

  select * into v_link
  from public.referral_invite_links
  where user_id = v_user_id
    and surface = v_surface
    and status = 'active'
    and resource_id is not distinct from p_resource_id
  order by created_at desc
  limit 1;

  if found then
    update public.referral_invite_links
    set required_invites = greatest(required_invites, v_required),
        updated_at = timezone('utc', now())
    where id = v_link.id
    returning * into v_link;
    return v_link;
  end if;

  insert into public.referral_invite_links (
    user_id, code, surface, resource_id, required_invites
  ) values (
    v_user_id,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_surface,
    p_resource_id,
    v_required
  )
  returning * into v_link;

  return v_link;
end;
$$;

create table if not exists public.marketplace_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  product_id uuid references public.marketplace_products(id) on delete set null,
  name text not null,
  product_name text not null default '',
  discount_label text not null default 'Visibility boost',
  reach_scope text not null default 'nearby',
  audience_type text not null default 'general',
  target_area text,
  duration_days integer not null default 3,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'pending_task',
  credit_cost integer not null default 5,
  credits_spent integer not null default 0,
  required_invites integer not null default 5,
  verified_invites integer not null default 0,
  referral_link_id uuid references public.referral_invite_links(id) on delete set null,
  view_limit integer,
  views integer not null default 0,
  orders integer not null default 0,
  revenue numeric(12, 2) not null default 0,
  budget_spent numeric(12, 2) not null default 0,
  budget_limit numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.marketplace_products
  add column if not exists promoted boolean not null default false,
  add column if not exists promoted_at timestamptz;

alter table if exists public.marketplace_promotions
  add column if not exists product_id uuid references public.marketplace_products(id) on delete set null,
  add column if not exists reach_scope text not null default 'nearby',
  add column if not exists audience_type text not null default 'general',
  add column if not exists target_area text,
  add column if not exists duration_days integer not null default 3,
  add column if not exists starts_at timestamptz,
  add column if not exists status text not null default 'pending_task',
  add column if not exists credit_cost integer not null default 5,
  add column if not exists credits_spent integer not null default 0,
  add column if not exists required_invites integer not null default 5,
  add column if not exists verified_invites integer not null default 0,
  add column if not exists referral_link_id uuid references public.referral_invite_links(id) on delete set null,
  add column if not exists view_limit integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists marketplace_promotions_business_status_idx
  on public.marketplace_promotions (business_id, status, created_at desc);
create index if not exists marketplace_promotions_active_delivery_idx
  on public.marketplace_promotions (status, starts_at, ends_at, views);
create index if not exists marketplace_products_promoted_idx
  on public.marketplace_products (promoted, promoted_at desc);

alter table public.marketplace_promotions enable row level security;

drop policy if exists "business owners manage marketplace promotions" on public.marketplace_promotions;
create policy "business owners manage marketplace promotions"
on public.marketplace_promotions for all to authenticated
using (
  exists (
    select 1
    from public.marketplace_businesses business
    where business.id = business_id
      and business.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.marketplace_businesses business
    where business.id = business_id
      and business.user_id = auth.uid()
  )
);

drop policy if exists "buyers read active marketplace promotions" on public.marketplace_promotions;
create policy "buyers read active marketplace promotions"
on public.marketplace_promotions for select to anon, authenticated
using (
  status = 'active'
  and starts_at <= timezone('utc', now())
  and ends_at > timezone('utc', now())
  and (view_limit is null or views < view_limit)
);

create or replace function public.create_marketplace_promotion_campaign(
  p_product_id uuid,
  p_duration_days integer default 3,
  p_reach_scope text default 'nearby',
  p_audience_type text default 'general',
  p_target_area text default null,
  p_view_limit integer default null,
  p_required_credits integer default 5,
  p_required_invites integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_wallet public.visibility_credit_wallets;
  v_link public.referral_invite_links;
  v_promotion public.marketplace_promotions;
  v_required_credits integer := greatest(1, coalesce(p_required_credits, 5));
  v_required_invites integer := greatest(5, coalesce(p_required_invites, 5));
  v_duration integer := greatest(1, least(coalesce(p_duration_days, 3), 90));
  v_reach text := lower(coalesce(nullif(btrim(p_reach_scope), ''), 'nearby'));
  v_audience text := lower(coalesce(nullif(btrim(p_audience_type), ''), 'general'));
  v_status text := 'pending_task';
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_user_id is null then
    raise exception 'Sign in to promote a product.';
  end if;

  select
    product.id,
    product.business_id,
    product.name,
    product.status,
    business.user_id
  into v_product
  from public.marketplace_products product
  join public.marketplace_businesses business on business.id = product.business_id
  where product.id = p_product_id
    and business.user_id = v_user_id;

  if not found then
    raise exception 'Choose one of your products before creating a promotion.';
  end if;

  v_wallet := public.ensure_visibility_wallet('urmall');

  if v_wallet.balance >= v_required_credits then
    update public.visibility_credit_wallets
    set balance = balance - v_required_credits,
        lifetime_spent = lifetime_spent + v_required_credits,
        updated_at = timezone('utc', now())
    where user_id = v_user_id
      and balance >= v_required_credits
    returning * into v_wallet;

    if found then
      insert into public.visibility_credit_transactions (
        user_id, amount, balance_after, reason, surface, reference_type, reference_id, metadata
      ) values (
        v_user_id, -v_required_credits, v_wallet.balance, 'promotion_spend', 'urmall',
        'marketplace_product', p_product_id,
        jsonb_build_object('productName', v_product.name, 'durationDays', v_duration, 'reach', v_reach)
      );

      v_status := 'active';
      v_start := timezone('utc', now());
      v_end := v_start + make_interval(days => v_duration);
    end if;
  end if;

  if v_status <> 'active' then
    v_link := public.create_referral_invite_link('urmall_promotion', p_product_id, v_required_invites);
  end if;

  insert into public.marketplace_promotions (
    business_id, product_id, name, product_name, discount_label,
    reach_scope, audience_type, target_area, duration_days, starts_at, ends_at,
    status, credit_cost, credits_spent, required_invites, verified_invites,
    referral_link_id, view_limit, budget_spent, budget_limit, metadata
  ) values (
    v_product.business_id,
    v_product.id,
    v_product.name || ' visibility boost',
    v_product.name,
    case
      when v_reach = 'countrywide' then 'Countrywide promotion'
      when v_audience = 'targeted' then 'Targeted promotion'
      else 'Nearby promotion'
    end,
    case when v_reach in ('nearby', 'countrywide') then v_reach else 'nearby' end,
    case when v_audience in ('general', 'targeted') then v_audience else 'general' end,
    nullif(btrim(coalesce(p_target_area, '')), ''),
    v_duration,
    v_start,
    v_end,
    v_status,
    v_required_credits,
    case when v_status = 'active' then v_required_credits else 0 end,
    v_required_invites,
    0,
    v_link.id,
    case when coalesce(p_view_limit, 0) > 0 then greatest(50, least(p_view_limit, 100000)) else null end,
    0,
    v_required_credits,
    jsonb_build_object(
      'activation', case when v_status = 'active' then 'credits' else 'referral_task' end,
      'creditsNeeded', greatest(0, v_required_credits - coalesce(v_wallet.balance, 0))
    )
  )
  returning * into v_promotion;

  if v_status = 'active' then
    update public.marketplace_products
    set promoted = true,
        promoted_at = timezone('utc', now())
    where id = v_product.id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'promotion', to_jsonb(v_promotion),
    'wallet', to_jsonb(v_wallet),
    'task', case when v_link.id is null then null else to_jsonb(v_link) end,
    'creditsNeeded', case when v_status = 'active' then 0 else greatest(0, v_required_credits - coalesce(v_wallet.balance, 0)) end
  );
end;
$$;

create or replace function public.record_marketplace_promotion_view(p_promotion_id uuid)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promotion public.marketplace_promotions;
begin
  update public.marketplace_promotions
  set views = views + 1,
      status = case
        when view_limit is not null and views + 1 >= view_limit then 'completed'
        else status
      end,
      ends_at = case
        when view_limit is not null and views + 1 >= view_limit then timezone('utc', now())
        else ends_at
      end,
      updated_at = timezone('utc', now())
  where id = p_promotion_id
    and status = 'active'
    and starts_at <= timezone('utc', now())
    and ends_at > timezone('utc', now())
  returning * into v_promotion;

  if found and v_promotion.status = 'completed' then
    update public.marketplace_products product
    set promoted = false
    where product.id = v_promotion.product_id
      and not exists (
        select 1
        from public.marketplace_promotions promotion
        where promotion.product_id = product.id
          and promotion.id <> v_promotion.id
          and promotion.status = 'active'
          and promotion.starts_at <= timezone('utc', now())
          and promotion.ends_at > timezone('utc', now())
          and (promotion.view_limit is null or promotion.views < promotion.view_limit)
      );
  end if;

  return v_promotion;
end;
$$;

alter table if exists public.explore_ad_campaigns
  add column if not exists visibility_package text,
  add column if not exists visibility_credits_required integer not null default 5,
  add column if not exists verified_invites_required integer not null default 5,
  add column if not exists verified_invites_count integer not null default 0,
  add column if not exists unlock_status text not null default 'not_required',
  add column if not exists referral_link_id uuid references public.referral_invite_links(id) on delete set null;

create or replace function public.apply_explore_ad_visibility_task(
  p_campaign_id uuid,
  p_visibility_package text default 'starter',
  p_required_invites integer default 5,
  p_required_credits integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign public.explore_ad_campaigns;
  v_link public.referral_invite_links;
  v_required_invites integer := greatest(5, coalesce(p_required_invites, 5));
  v_required_credits integer := greatest(1, coalesce(p_required_credits, 5));
begin
  if v_user_id is null then
    raise exception 'Sign in to manage advert visibility.';
  end if;

  select * into v_campaign
  from public.explore_ad_campaigns
  where id = p_campaign_id
    and advertiser_id = v_user_id;

  if not found then
    raise exception 'Advertisement campaign was not found.';
  end if;

  v_link := public.create_referral_invite_link('explore_advert', v_campaign.creative_post_id, v_required_invites);

  update public.explore_ad_campaigns
  set visibility_package = lower(coalesce(nullif(btrim(p_visibility_package), ''), 'starter')),
      visibility_credits_required = v_required_credits,
      verified_invites_required = v_required_invites,
      verified_invites_count = 0,
      unlock_status = 'pending_task',
      referral_link_id = v_link.id,
      status = case when status = 'active' then 'paused' else status end,
      updated_at = timezone('utc', now())
  where id = p_campaign_id
  returning * into v_campaign;

  return jsonb_build_object(
    'campaign', to_jsonb(v_campaign),
    'task', to_jsonb(v_link)
  );
end;
$$;

grant execute on function public.ensure_visibility_wallet(text) to authenticated;
grant execute on function public.create_referral_invite_link(text, uuid, integer) to authenticated;
grant execute on function public.create_marketplace_promotion_campaign(uuid, integer, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.record_marketplace_promotion_view(uuid) to anon, authenticated;
grant execute on function public.apply_explore_ad_visibility_task(uuid, text, integer, integer) to authenticated;

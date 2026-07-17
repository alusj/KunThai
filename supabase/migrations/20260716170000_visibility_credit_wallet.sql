-- KunThai Visibility Credits
-- One verified invited user earns 5 credits. Credits are spent on Explore adverts
-- and UrMall promoted products; they are not cash and cannot be withdrawn.

create table if not exists public.visibility_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visibility_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  balance_after integer not null default 0,
  transaction_type text not null check (transaction_type in ('invite_reward', 'boost_spend', 'admin_adjustment', 'refund')),
  surface text not null default 'platform',
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visibility_invite_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  reward_credits integer not null default 5 check (reward_credits > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.visibility_invite_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.visibility_invite_links(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'credited', 'ineligible')),
  credits_awarded integer not null default 0 check (credits_awarded >= 0),
  credited_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (invited_user_id)
);

create index if not exists visibility_credit_transactions_user_idx
  on public.visibility_credit_transactions (user_id, created_at desc);
create index if not exists visibility_invite_links_user_idx
  on public.visibility_invite_links (user_id, status, created_at desc);
create index if not exists visibility_invite_events_inviter_idx
  on public.visibility_invite_events (inviter_user_id, created_at desc);

alter table public.visibility_credit_wallets enable row level security;
alter table public.visibility_credit_transactions enable row level security;
alter table public.visibility_invite_links enable row level security;
alter table public.visibility_invite_events enable row level security;

drop policy if exists "Users read own visibility wallet" on public.visibility_credit_wallets;
create policy "Users read own visibility wallet"
on public.visibility_credit_wallets for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own visibility transactions" on public.visibility_credit_transactions;
create policy "Users read own visibility transactions"
on public.visibility_credit_transactions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own visibility invite links" on public.visibility_invite_links;
create policy "Users read own visibility invite links"
on public.visibility_invite_links for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own visibility invite events" on public.visibility_invite_events;
create policy "Users read own visibility invite events"
on public.visibility_invite_events for select to authenticated
using (inviter_user_id = auth.uid() or invited_user_id = auth.uid());

alter table if exists public.explore_ad_campaigns
  add column if not exists credit_budget integer not null default 0 check (credit_budget >= 0),
  add column if not exists credits_spent integer not null default 0 check (credits_spent >= 0);

alter table if exists public.marketplace_promotions
  add column if not exists product_id uuid references public.marketplace_products(id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists credit_budget integer not null default 0 check (credit_budget >= 0),
  add column if not exists credits_spent integer not null default 0 check (credits_spent >= 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.marketplace_promotions enable row level security;

drop policy if exists "Buyers read active marketplace promotions" on public.marketplace_promotions;
create policy "Buyers read active marketplace promotions"
on public.marketplace_promotions for select to anon, authenticated
using (
  status = 'active'
  and product_id is not null
  and (ends_at is null or ends_at > timezone('utc', now()))
);

create or replace function public.ensure_visibility_credit_wallet()
returns public.visibility_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.visibility_credit_wallets;
begin
  if auth.uid() is null then
    raise exception 'Sign in to use Visibility Credits.';
  end if;

  insert into public.visibility_credit_wallets (user_id)
  values (auth.uid())
  on conflict (user_id) do update
    set updated_at = public.visibility_credit_wallets.updated_at
  returning * into v_wallet;

  return v_wallet;
end;
$$;

create or replace function public.create_visibility_invite_link()
returns public.visibility_invite_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.visibility_invite_links;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create an invite link.';
  end if;

  select * into v_link
  from public.visibility_invite_links
  where user_id = auth.uid() and status = 'active'
  order by created_at desc
  limit 1;

  if v_link.id is not null then
    return v_link;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.visibility_invite_links where code = v_code);
  end loop;

  insert into public.visibility_invite_links (user_id, code, reward_credits)
  values (auth.uid(), v_code, 5)
  returning * into v_link;

  return v_link;
end;
$$;

create or replace function public.spend_visibility_credits(
  p_amount integer,
  p_surface text default 'platform',
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.visibility_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer := greatest(0, coalesce(p_amount, 0));
  v_wallet public.visibility_credit_wallets;
begin
  if auth.uid() is null then
    raise exception 'Sign in to spend Visibility Credits.';
  end if;

  if v_amount < 5 then
    raise exception 'Choose at least 5 Visibility Credits for a boost.';
  end if;

  perform public.ensure_visibility_credit_wallet();

  select * into v_wallet
  from public.visibility_credit_wallets
  where user_id = auth.uid()
  for update;

  if coalesce(v_wallet.balance, 0) < v_amount then
    raise exception 'Not enough Visibility Credits. Available: %, required: %', coalesce(v_wallet.balance, 0), v_amount;
  end if;

  update public.visibility_credit_wallets
  set balance = balance - v_amount,
      lifetime_spent = lifetime_spent + v_amount,
      updated_at = timezone('utc', now())
  where user_id = auth.uid()
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    auth.uid(), -v_amount, v_wallet.balance, 'boost_spend',
    lower(coalesce(nullif(btrim(p_surface), ''), 'platform')),
    nullif(btrim(coalesce(p_reference_type, '')), ''),
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_wallet;
end;
$$;

create or replace function public.finalize_visibility_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invited_user auth.users;
  v_link public.visibility_invite_links;
  v_existing public.visibility_invite_events;
  v_event public.visibility_invite_events;
  v_wallet public.visibility_credit_wallets;
  v_verified boolean;
begin
  if auth.uid() is null or v_code = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invited_user from auth.users where id = auth.uid();
  select * into v_link from public.visibility_invite_links where code = v_code and status = 'active';

  if v_link.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_link.user_id = auth.uid() then
    return jsonb_build_object('status', 'self_invite');
  end if;

  if v_invited_user.created_at < v_link.created_at then
    return jsonb_build_object('status', 'ineligible');
  end if;

  v_verified := v_invited_user.email_confirmed_at is not null
    or v_invited_user.phone_confirmed_at is not null;

  select * into v_existing
  from public.visibility_invite_events
  where invited_user_id = auth.uid()
  limit 1;

  if v_existing.status = 'credited' then
    return jsonb_build_object('status', 'already_credited');
  end if;

  if v_existing.id is not null and v_existing.link_id is distinct from v_link.id then
    return jsonb_build_object('status', 'ineligible');
  end if;

  if not v_verified then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, auth.uid(), 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_verification');
  end if;

  insert into public.visibility_invite_events (
    link_id, inviter_user_id, invited_user_id, status, credits_awarded, credited_at
  ) values (
    v_link.id, v_link.user_id, auth.uid(), 'credited', v_link.reward_credits, timezone('utc', now())
  )
  on conflict (invited_user_id) do update
    set status = 'credited',
        credits_awarded = excluded.credits_awarded,
        credited_at = coalesce(public.visibility_invite_events.credited_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where public.visibility_invite_events.link_id = excluded.link_id
      and public.visibility_invite_events.status <> 'credited'
  returning * into v_event;

  if v_event.id is null then
    return jsonb_build_object('status', 'already_credited');
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_link.user_id, v_link.reward_credits, v_link.reward_credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_link.user_id, v_link.reward_credits, v_wallet.balance, 'invite_reward', 'platform',
    'visibility_invite_event', v_event.id,
    jsonb_build_object('invitedUserId', auth.uid(), 'inviteCode', v_link.code)
  );

  return jsonb_build_object(
    'status', 'credited',
    'creditsAwarded', v_link.reward_credits,
    'inviterUserId', v_link.user_id
  );
end;
$$;

create or replace function public.create_explore_ad_campaign(
  p_post_id uuid,
  p_placement text default 'urfeed',
  p_objective text default 'brand_awareness',
  p_audience_type text default 'recommended',
  p_minimum_age integer default 13,
  p_maximum_age integer default null,
  p_gender_target text default 'all',
  p_interest_categories text[] default '{}',
  p_target_area text default null,
  p_duration_days integer default 14,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_type text default 'total',
  p_budget_amount numeric default 0,
  p_currency text default null,
  p_credit_budget integer default null
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.explore_posts;
  v_start timestamptz := coalesce(p_starts_at, timezone('utc', now()));
  v_end timestamptz;
  v_campaign public.explore_ad_campaigns;
  v_post_safe boolean;
  v_advertiser_country text;
  v_currency text;
  v_credit_budget integer := greatest(0, coalesce(p_credit_budget, floor(greatest(0, coalesce(p_budget_amount, 0)))::integer, 0));
  v_previous_credit_budget integer := 0;
  v_credit_delta integer := 0;
begin
  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for an advert boost.';
  end if;

  v_advertiser_country := public.kunthai_resolve_country_iso(
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'country_code', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'country', ''),
      (
        select coalesce(
          nullif(auth_user.raw_user_meta_data ->> 'country_code', ''),
          nullif(auth_user.raw_user_meta_data ->> 'country', '')
        )
        from auth.users auth_user
        where auth_user.id = auth.uid()
      )
    )
  );

  if not public.kunthai_country_feature_enabled(v_advertiser_country, 'adverts') then
    raise exception 'Advertising is not yet available in your country.';
  end if;

  v_currency := public.kunthai_resolve_currency(v_advertiser_country, p_currency);

  select * into v_post from public.explore_posts where id = p_post_id;
  if v_post.id is null or v_post.user_id is distinct from auth.uid() then
    raise exception 'Advertisement creative was not found or is not owned by the current user';
  end if;

  if not (v_post.post_type = 'advert' or v_post.category = 'advert' or coalesce(v_post.media_meta, '{}'::jsonb) ? 'advert') then
    raise exception 'Only Explore advertisement creatives can create campaigns';
  end if;

  if p_placement in ('swip', 'both') and nullif(btrim(coalesce(v_post.video_url, '')), '') is null then
    raise exception 'Swip placement requires a reviewed video';
  end if;

  if p_placement in ('urfeed', 'both')
    and nullif(btrim(coalesce(v_post.video_url, '')), '') is not null
    and nullif(btrim(coalesce(v_post.image_url, '')), '') is null
  then
    raise exception 'UrFeed placement for a video advertisement requires an image';
  end if;

  select coalesce(credit_budget, 0) into v_previous_credit_budget
  from public.explore_ad_campaigns
  where creative_post_id = v_post.id and advertiser_id = auth.uid();

  v_end := coalesce(p_ends_at, v_start + make_interval(days => greatest(1, least(coalesce(p_duration_days, 14), 365))));
  v_post_safe := coalesce(v_post.moderation_status, 'not_required') in ('not_required', 'approved', 'legacy');

  insert into public.explore_ad_campaigns (
    creative_post_id, advertiser_id, placement, objective, audience_type,
    minimum_age, maximum_age, gender_target, interest_categories, target_area,
    duration_days, starts_at, ends_at, budget_type, budget_amount, currency,
    credit_budget, credits_spent, status, moderation_status, updated_at
  ) values (
    v_post.id, auth.uid(), lower(coalesce(p_placement, 'urfeed')),
    lower(coalesce(p_objective, 'brand_awareness')),
    lower(coalesce(p_audience_type, 'recommended')),
    greatest(13, least(coalesce(p_minimum_age, 13), 120)),
    case when p_maximum_age is null then null else greatest(coalesce(p_minimum_age, 13), least(p_maximum_age, 120)) end,
    lower(coalesce(p_gender_target, 'all')),
    coalesce(p_interest_categories, '{}'::text[]), nullif(btrim(coalesce(p_target_area, '')), ''),
    greatest(1, least(coalesce(p_duration_days, 14), 365)), v_start, v_end,
    'total', v_credit_budget, v_currency,
    v_credit_budget, v_credit_budget,
    case when v_post_safe then 'active' else 'pending_review' end,
    case when v_post_safe then 'approved' else 'pending' end,
    timezone('utc', now())
  )
  on conflict (creative_post_id) do update set
    placement = excluded.placement,
    objective = excluded.objective,
    audience_type = excluded.audience_type,
    minimum_age = excluded.minimum_age,
    maximum_age = excluded.maximum_age,
    gender_target = excluded.gender_target,
    interest_categories = excluded.interest_categories,
    target_area = excluded.target_area,
    duration_days = excluded.duration_days,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    budget_type = excluded.budget_type,
    budget_amount = excluded.budget_amount,
    currency = excluded.currency,
    credit_budget = excluded.credit_budget,
    credits_spent = excluded.credits_spent,
    status = excluded.status,
    moderation_status = excluded.moderation_status,
    updated_at = timezone('utc', now())
  returning * into v_campaign;

  v_credit_delta := greatest(0, v_credit_budget - coalesce(v_previous_credit_budget, 0));
  if v_credit_delta > 0 then
    perform public.spend_visibility_credits(
      v_credit_delta,
      'explore',
      'explore_ad_campaign',
      v_campaign.id,
      jsonb_build_object('postId', v_post.id, 'placement', lower(coalesce(p_placement, 'urfeed')))
    );
  end if;

  update public.explore_posts
  set post_privacy = 'public', post_type = 'advert', category = 'advert'
  where id = v_post.id;

  return v_campaign;
end;
$$;

create or replace function public.create_marketplace_visibility_promotion(
  p_product_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.marketplace_businesses;
  v_product public.marketplace_products;
  v_promotion public.marketplace_promotions;
  v_credit_budget integer := greatest(0, coalesce(p_credit_budget, 5));
  v_audience_type text := lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide'));
  v_duration_days integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to promote products.';
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for a product boost.';
  end if;

  select * into v_business
  from public.marketplace_businesses
  where user_id = auth.uid()
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_business.id is null then
    raise exception 'Register a business before promoting products.';
  end if;

  select * into v_product
  from public.marketplace_products
  where id = p_product_id and business_id = v_business.id;

  if v_product.id is null then
    raise exception 'Choose a product from your business before promoting.';
  end if;

  v_duration_days := greatest(1, least(30, ceiling(v_credit_budget::numeric / 5)::integer * 3));

  insert into public.marketplace_promotions (
    business_id, product_id, name, product_name, discount_label,
    budget_spent, budget_limit, credit_budget, credits_spent,
    views, orders, revenue, status, starts_at, ends_at, metadata
  ) values (
    v_business.id, v_product.id, concat(v_product.name, ' boost'), v_product.name,
    'Visibility boost',
    0, v_credit_budget, v_credit_budget, v_credit_budget,
    0, 0, 0, 'active', timezone('utc', now()),
    timezone('utc', now()) + make_interval(days => v_duration_days),
    jsonb_build_object(
      'durationDays', v_duration_days,
      'audienceType', v_audience_type,
      'source', 'visibility_credits'
    )
  )
  returning * into v_promotion;

  perform public.spend_visibility_credits(
    v_credit_budget,
    'urmall',
    'marketplace_promotion',
    v_promotion.id,
    jsonb_build_object('productId', v_product.id, 'productName', v_product.name)
  );

  update public.marketplace_products
  set promoted = true,
      promoted_at = coalesce(promoted_at, timezone('utc', now())),
      status = case when status = 'draft' then 'active' else status end,
      updated_at = timezone('utc', now())
  where id = v_product.id and business_id = v_business.id;

  return v_promotion;
end;
$$;

grant execute on function public.ensure_visibility_credit_wallet() to authenticated;
grant execute on function public.create_visibility_invite_link() to authenticated;
grant execute on function public.finalize_visibility_invite(text) to authenticated;
grant execute on function public.spend_visibility_credits(integer, text, text, uuid, jsonb) to authenticated;
grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer) to authenticated;
grant execute on function public.create_marketplace_visibility_promotion(uuid, integer, text) to authenticated;
grant select on public.marketplace_promotions to anon, authenticated;

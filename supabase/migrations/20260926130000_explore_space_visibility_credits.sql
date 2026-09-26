-- Visibility Credits for Spaces.
--
-- * Every Space has its own wallet and ledger (its members can read them;
--   only the functions below write). A new Space starts with 5 credits;
--   Spaces created before this migration receive the same 5 once.
-- * A Space has its own invite link (a visibility_invite_links row carrying
--   space_id). Shares made while acting as the Space carry that code. When
--   the invited person verifies, finishes onboarding and lands on a
--   dashboard (the same rule as personal invites) the Space earns 5.
-- * Boosting a Space's post as its owner/administrator spends the Space's
--   credits when they cover it; otherwise personal credits, as before.
--
-- Function bodies are copied verbatim from their latest migrations
-- (20260813100000, 20260716170000, 20260816130000); only the marked parts
-- change. Safe to re-run; runs as one transaction (all or nothing).

begin;

create table if not exists public.explore_space_credit_wallets (
  space_id uuid primary key references public.explore_spaces(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_space_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.explore_spaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  amount integer not null,
  balance_after integer not null default 0,
  transaction_type text not null check (transaction_type in ('starter_bonus', 'invite_reward', 'boost_spend', 'admin_adjustment', 'refund')),
  surface text not null default 'explore',
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists explore_space_credit_transactions_space_idx
on public.explore_space_credit_transactions (space_id, created_at desc);

alter table public.explore_space_credit_wallets enable row level security;
alter table public.explore_space_credit_transactions enable row level security;

drop policy if exists "space members read space credit wallet" on public.explore_space_credit_wallets;
create policy "space members read space credit wallet"
on public.explore_space_credit_wallets for select to authenticated
using (public.explore_space_role_allows(space_id, null));

drop policy if exists "space members read space credit transactions" on public.explore_space_credit_transactions;
create policy "space members read space credit transactions"
on public.explore_space_credit_transactions for select to authenticated
using (public.explore_space_role_allows(space_id, null));

revoke all on public.explore_space_credit_wallets from anon;
revoke all on public.explore_space_credit_transactions from anon;
grant select on public.explore_space_credit_wallets to authenticated;
grant select on public.explore_space_credit_transactions to authenticated;

-- Space invite links live beside personal ones, one active link per Space.
alter table public.visibility_invite_links
  add column if not exists space_id uuid references public.explore_spaces(id) on delete cascade;

create unique index if not exists visibility_invite_links_one_per_space_idx
on public.visibility_invite_links (space_id)
where space_id is not null;

-- 5 starter credits for every new Space. Never blocks Space creation.
create or replace function public.grant_explore_space_starter_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.explore_space_credit_wallets;
begin
  begin
    insert into public.explore_space_credit_wallets (space_id, balance, lifetime_earned)
    values (new.id, 5, 5)
    on conflict (space_id) do nothing
    returning * into v_wallet;

    if v_wallet.space_id is not null then
      insert into public.explore_space_credit_transactions (
        space_id, actor_user_id, amount, balance_after, transaction_type, surface, metadata
      ) values (
        new.id, new.owner_user_id, 5, v_wallet.balance, 'starter_bonus', 'platform',
        jsonb_build_object('reason', 'space_created')
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.grant_explore_space_starter_credits() from public, anon, authenticated;

drop trigger if exists explore_spaces_starter_credits on public.explore_spaces;
create trigger explore_spaces_starter_credits
after insert on public.explore_spaces
for each row execute function public.grant_explore_space_starter_credits();

-- Spaces that already exist get the same one-time 5 starter credits.
with created as (
  insert into public.explore_space_credit_wallets (space_id, balance, lifetime_earned)
  select space.id, 5, 5
  from public.explore_spaces space
  where coalesce(space.status, 'active') <> 'deleted'
  on conflict (space_id) do nothing
  returning space_id, balance
)
insert into public.explore_space_credit_transactions (
  space_id, actor_user_id, amount, balance_after, transaction_type, surface, metadata
)
select created.space_id, space.owner_user_id, 5, created.balance, 'starter_bonus', 'platform',
  jsonb_build_object('reason', 'space_credits_launch')
from created
join public.explore_spaces space on space.id = created.space_id;

-- A Space member reads the Space's wallet; the Space's invite link is created
-- on first use (owned by the Space owner, credited to the Space).
create or replace function public.get_explore_space_credit_wallet(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.explore_spaces;
  v_wallet public.explore_space_credit_wallets;
  v_link public.visibility_invite_links;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see Visibility Credits.';
  end if;

  select * into v_space from public.explore_spaces where id = p_space_id;
  if v_space.id is null or not (
    v_space.owner_user_id = auth.uid()
    or public.explore_space_role_allows(p_space_id, null)
  ) then
    raise exception 'Only members of this Space can see its Visibility Credits.';
  end if;

  insert into public.explore_space_credit_wallets (space_id)
  values (p_space_id)
  on conflict (space_id) do nothing;

  select * into v_wallet from public.explore_space_credit_wallets where space_id = p_space_id;

  select * into v_link
  from public.visibility_invite_links
  where space_id = p_space_id and status = 'active'
  limit 1;

  if v_link.id is null then
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.visibility_invite_links where code = v_code);
    end loop;

    insert into public.visibility_invite_links (user_id, space_id, code, reward_credits)
    values (v_space.owner_user_id, p_space_id, v_code, 5)
    on conflict do nothing
    returning * into v_link;

    if v_link.id is null then
      select * into v_link from public.visibility_invite_links where space_id = p_space_id limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'spaceId', p_space_id,
    'balance', coalesce(v_wallet.balance, 0),
    'lifetimeEarned', coalesce(v_wallet.lifetime_earned, 0),
    'lifetimeSpent', coalesce(v_wallet.lifetime_spent, 0),
    'inviteCode', coalesce(v_link.code, ''),
    'rewardPerVerifiedInvite', 5,
    'canSpend', v_space.owner_user_id = auth.uid()
      or public.explore_space_role_allows(p_space_id, array['owner', 'administrator'])
  );
end;
$$;

revoke all on function public.get_explore_space_credit_wallet(uuid) from public, anon;
grant execute on function public.get_explore_space_credit_wallet(uuid) to authenticated;

-- Personal invite link: unchanged except it never returns a Space's link.
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
  where user_id = auth.uid() and status = 'active' and space_id is null
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

-- Invite crediting: unchanged except the Space branch.
create or replace function public.apply_visibility_invite(
  p_invited_user_id uuid,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_credits constant integer := 5;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invited_user auth.users;
  v_inviter_user auth.users;
  v_link public.visibility_invite_links;
  v_existing public.visibility_invite_events;
  v_event public.visibility_invite_events;
  v_wallet public.visibility_credit_wallets;
  v_verified boolean;
  v_onboarded boolean;
  v_landing_surface text;
  v_invited_name text;
  v_inviter_name text;
  v_notification_target text;
  v_space_wallet public.explore_space_credit_wallets;
  v_space_name text;
begin
  if p_invited_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invited_user
  from auth.users
  where id = p_invited_user_id;

  if v_invited_user.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_code = '' then
    v_code := upper(btrim(coalesce(v_invited_user.raw_user_meta_data ->> 'visibility_invite_code', '')));
  end if;

  select * into v_existing
  from public.visibility_invite_events
  where invited_user_id = p_invited_user_id
  limit 1;

  if v_existing.status = 'credited' then
    return jsonb_build_object(
      'status', 'already_credited',
      'creditsAwarded', v_existing.credits_awarded,
      'inviterUserId', v_existing.inviter_user_id
    );
  end if;

  if v_code <> '' then
    select * into v_link
    from public.visibility_invite_links
    where code = v_code and status = 'active';
  elsif v_existing.id is not null then
    select * into v_link
    from public.visibility_invite_links
    where id = v_existing.link_id and status = 'active';
  end if;

  if v_link.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_link.user_id = p_invited_user_id then
    return jsonb_build_object('status', 'self_invite');
  end if;

  if v_invited_user.created_at < v_link.created_at then
    return jsonb_build_object('status', 'ineligible');
  end if;

  if v_existing.id is not null and v_existing.link_id is distinct from v_link.id then
    return jsonb_build_object('status', 'ineligible');
  end if;

  v_verified := v_invited_user.email_confirmed_at is not null
    or v_invited_user.phone_confirmed_at is not null;
  v_onboarded := lower(coalesce(v_invited_user.raw_user_meta_data ->> 'onboarding_complete', ''))
    in ('true', 't', '1', 'yes');
  v_landing_surface := lower(btrim(coalesce(v_invited_user.raw_user_meta_data ->> 'primary_surface', '')));

  if not v_verified then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, p_invited_user_id, 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_verification');
  end if;

  if not v_onboarded or v_landing_surface not in ('explore', 'marketplace', 'transport') then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, p_invited_user_id, 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_dashboard_landing');
  end if;

  insert into public.visibility_invite_events (
    link_id, inviter_user_id, invited_user_id, status, credits_awarded, credited_at
  ) values (
    v_link.id, v_link.user_id, p_invited_user_id, 'credited', v_reward_credits, timezone('utc', now())
  )
  on conflict (invited_user_id) do update
    set status = 'credited',
        credits_awarded = v_reward_credits,
        credited_at = coalesce(public.visibility_invite_events.credited_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where public.visibility_invite_events.link_id = excluded.link_id
      and public.visibility_invite_events.status <> 'credited'
  returning * into v_event;

  if v_event.id is null then
    return jsonb_build_object('status', 'already_credited');
  end if;

  select * into v_inviter_user
  from auth.users
  where id = v_link.user_id;

  v_invited_name := coalesce(
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(concat_ws(' ', v_invited_user.raw_user_meta_data ->> 'first_name', v_invited_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(split_part(coalesce(v_invited_user.email, ''), '@', 1)), ''),
    'A new member'
  );

  v_inviter_name := coalesce(
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(concat_ws(' ', v_inviter_user.raw_user_meta_data ->> 'first_name', v_inviter_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(split_part(coalesce(v_inviter_user.email, ''), '@', 1)), ''),
    'Your inviter'
  );

  -- A Space's invite link credits the Space's own wallet, never the
  -- owner's personal one. Notifications name the Space.
  if v_link.space_id is not null then
    select name into v_space_name from public.explore_spaces where id = v_link.space_id;
    v_space_name := coalesce(nullif(btrim(v_space_name), ''), 'Your Space');

    insert into public.explore_space_credit_wallets (space_id, balance, lifetime_earned)
    values (v_link.space_id, v_reward_credits, v_reward_credits)
    on conflict (space_id) do update
      set balance = public.explore_space_credit_wallets.balance + excluded.balance,
          lifetime_earned = public.explore_space_credit_wallets.lifetime_earned + excluded.lifetime_earned,
          updated_at = timezone('utc', now())
    returning * into v_space_wallet;

    insert into public.explore_space_credit_transactions (
      space_id, actor_user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
    ) values (
      v_link.space_id,
      null,
      v_reward_credits,
      v_space_wallet.balance,
      'invite_reward',
      'platform',
      'visibility_invite_event',
      v_event.id,
      jsonb_build_object(
        'invitedUserId', p_invited_user_id,
        'invitedName', v_invited_name,
        'inviteCode', v_link.code,
        'landingSurface', v_landing_surface
      )
    );

    v_notification_target := format('visibility-invite:%s', v_event.id);

    insert into public.platform_notifications (
      user_id, sector, notification_type, title, body, priority, status, action_target
    ) values
      (
        v_link.user_id,
        'platform',
        'visibility_credit_reward',
        format('5 Visibility Credits earned for %s', v_space_name),
        format(
          'Great news — %s successfully joined KunThai through %s''s invite. 5 Visibility Credits have been added to %s.',
          v_invited_name, v_space_name, v_space_name
        ),
        'normal',
        'unread',
        v_notification_target
      ),
      (
        p_invited_user_id,
        'platform',
        'visibility_invite_success',
        'Your KunThai invite was successful',
        format(
          '%s earned 5 Visibility Credits when you completed your KunThai setup. Share your own invite link to earn credits when friends successfully join.',
          v_space_name
        ),
        'normal',
        'unread',
        v_notification_target
      )
    on conflict do nothing;

    return jsonb_build_object(
      'status', 'credited',
      'creditsAwarded', v_reward_credits,
      'inviterUserId', v_link.user_id,
      'inviterName', v_space_name,
      'invitedName', v_invited_name,
      'landingSurface', v_landing_surface,
      'spaceId', v_link.space_id
    );
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_link.user_id, v_reward_credits, v_reward_credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_link.user_id,
    v_reward_credits,
    v_wallet.balance,
    'invite_reward',
    'platform',
    'visibility_invite_event',
    v_event.id,
    jsonb_build_object(
      'invitedUserId', p_invited_user_id,
      'invitedName', v_invited_name,
      'inviteCode', v_link.code,
      'landingSurface', v_landing_surface
    )
  );

  v_notification_target := format('visibility-invite:%s', v_event.id);

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status, action_target
  ) values
    (
      v_link.user_id,
      'platform',
      'visibility_credit_reward',
      '5 Visibility Credits earned',
      format(
        'Great news — %s successfully joined KunThai through your invite. 5 Visibility Credits have been added to your balance.',
        v_invited_name
      ),
      'normal',
      'unread',
      v_notification_target
    ),
    (
      p_invited_user_id,
      'platform',
      'visibility_invite_success',
      'Your KunThai invite was successful',
      format(
        '%s earned 5 Visibility Credits when you completed your KunThai setup. Share your own invite link to earn credits when friends successfully join.',
        v_inviter_name
      ),
      'normal',
      'unread',
      v_notification_target
    )
  on conflict do nothing;

  return jsonb_build_object(
    'status', 'credited',
    'creditsAwarded', v_reward_credits,
    'inviterUserId', v_link.user_id,
    'inviterName', v_inviter_name,
    'invitedName', v_invited_name,
    'landingSurface', v_landing_surface
  );
end;
$$;

revoke all on function public.apply_visibility_invite(uuid, text) from public, anon, authenticated;

-- Advert boosts: unchanged except the Space wallet branch.
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
  -- Per-viewer frequency caps scale with the boost. Both stay inside the table
  -- CHECK bounds (daily 1-20, total 1-500). At 5 credits these equal the old
  -- defaults (3/day, 30 total); larger budgets earn proportionally more.
  v_daily_cap integer := least(20, greatest(3, ceil(v_credit_budget / 20.0)::integer));
  v_total_cap integer := least(500, greatest(30, v_credit_budget * 2));
  v_space_id uuid;
  v_space_wallet public.explore_space_credit_wallets;
  v_paid_by_space boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to boost adverts.';
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for an advert boost.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));

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
    credit_budget, credits_spent, daily_impression_cap, total_impression_cap,
    status, moderation_status, updated_at
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
    v_credit_budget, v_credit_budget, v_daily_cap, v_total_cap,
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
    daily_impression_cap = excluded.daily_impression_cap,
    total_impression_cap = excluded.total_impression_cap,
    status = excluded.status,
    moderation_status = excluded.moderation_status,
    updated_at = timezone('utc', now())
  returning * into v_campaign;

  v_credit_delta := greatest(0, v_credit_budget - coalesce(v_previous_credit_budget, 0));
  -- A Space's post boosted by its owner or an administrator is paid from the
  -- Space's credits when they cover it; otherwise (or for anyone else) the
  -- booster's personal credits are used, exactly as before.
  v_space_id := coalesce(v_post.space_id, case when v_post.actor_type = 'space' then v_post.actor_id end);
  if v_credit_delta > 0
    and v_space_id is not null
    and public.explore_space_role_allows(v_space_id, array['owner', 'administrator'])
  then
    select * into v_space_wallet
    from public.explore_space_credit_wallets
    where space_id = v_space_id
    for update;

    if coalesce(v_space_wallet.balance, 0) >= v_credit_delta then
      update public.explore_space_credit_wallets
      set balance = balance - v_credit_delta,
          lifetime_spent = lifetime_spent + v_credit_delta,
          updated_at = timezone('utc', now())
      where space_id = v_space_id
      returning * into v_space_wallet;

      insert into public.explore_space_credit_transactions (
        space_id, actor_user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
      ) values (
        v_space_id, auth.uid(), -v_credit_delta, v_space_wallet.balance, 'boost_spend', 'explore',
        'explore_ad_campaign', v_campaign.id,
        jsonb_build_object('postId', v_post.id, 'placement', lower(coalesce(p_placement, 'urfeed')), 'paidBy', 'space')
      );
      v_paid_by_space := true;
    end if;
  end if;

  if v_credit_delta > 0 and not v_paid_by_space then
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

grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer) to authenticated;

commit;

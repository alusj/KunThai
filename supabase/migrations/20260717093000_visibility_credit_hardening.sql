-- Visibility Credits hardening
-- 1. Remove stale function overloads: the pre-credit 15-arg create_explore_ad_campaign
--    still created campaigns without spending any credits, and the 2-arg
--    create_marketplace_visibility_promotion made PostgREST RPC calls ambiguous.
-- 2. Invite crediting must survive the invited user confirming their email on a
--    different device: the invite code is stored in signup metadata and a trigger
--    on auth.users credits the inviter the moment the account becomes verified.
-- 3. Boost spending is serialized per user so a double-submit can never charge twice.

drop function if exists public.create_explore_ad_campaign(
  uuid, text, text, text, integer, integer, text, text[], text, integer,
  timestamptz, timestamptz, text, numeric, text
);
drop function if exists public.create_marketplace_visibility_promotion(uuid, integer);

-- Internal crediting core shared by the client RPC and the auth trigger.
-- Never exposed to clients: it accepts an arbitrary user id.
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
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invited_user auth.users;
  v_link public.visibility_invite_links;
  v_existing public.visibility_invite_events;
  v_event public.visibility_invite_events;
  v_wallet public.visibility_credit_wallets;
  v_verified boolean;
begin
  if p_invited_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invited_user from auth.users where id = p_invited_user_id;
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
    return jsonb_build_object('status', 'already_credited');
  end if;

  if v_code <> '' then
    select * into v_link
    from public.visibility_invite_links
    where code = v_code and status = 'active';
  elsif v_existing.id is not null then
    -- The signup browser lost the code but a pending event already recorded the link.
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

  insert into public.visibility_invite_events (
    link_id, inviter_user_id, invited_user_id, status, credits_awarded, credited_at
  ) values (
    v_link.id, v_link.user_id, p_invited_user_id, 'credited', v_link.reward_credits, timezone('utc', now())
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
    jsonb_build_object('invitedUserId', p_invited_user_id, 'inviteCode', v_link.code)
  );

  return jsonb_build_object(
    'status', 'credited',
    'creditsAwarded', v_link.reward_credits,
    'inviterUserId', v_link.user_id
  );
end;
$$;

revoke all on function public.apply_visibility_invite(uuid, text) from public, anon, authenticated;

create or replace function public.finalize_visibility_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  return public.apply_visibility_invite(auth.uid(), p_code);
end;
$$;

grant execute on function public.finalize_visibility_invite(text) to authenticated;

-- Credit the inviter as soon as the invited account becomes verified, even when
-- the confirmation link opens on a device that never saw the invite link.
create or replace function public.handle_visibility_invite_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.email_confirmed_at is not null or new.phone_confirmed_at is not null)
    and (tg_op = 'INSERT' or coalesce(old.email_confirmed_at, old.phone_confirmed_at) is null)
  then
    begin
      perform public.apply_visibility_invite(new.id, new.raw_user_meta_data ->> 'visibility_invite_code');
    exception when others then
      null; -- invite crediting must never block authentication
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists visibility_invite_confirmation on auth.users;
create trigger visibility_invite_confirmation
after insert or update of email_confirmed_at, phone_confirmed_at on auth.users
for each row execute function public.handle_visibility_invite_confirmation();

-- Serialize a user's boost purchases: without this, two concurrent submits both
-- read the same "previous budget" and each spend the full delta.
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

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));

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

  if exists (
    select 1
    from public.marketplace_promotions
    where product_id = v_product.id
      and status = 'active'
      and (ends_at is null or ends_at > timezone('utc', now()))
  ) then
    raise exception 'This product already has an active visibility boost. Wait for it to finish before starting a new one.';
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

grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer) to authenticated;
grant execute on function public.create_marketplace_visibility_promotion(uuid, integer, text) to authenticated;

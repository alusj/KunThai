-- Space Visibility Credits, part 2: send credits from a Space and buy
-- credits for a Space. Requires 20260926130000_explore_space_visibility_credits.
--
-- * A Space's owner or administrator can send the Space's credits to any
--   KunThai user by KunThai ID, under the same rules as personal sharing
--   (the Space needs more than 10 credits; you cannot send to yourself).
-- * A purchase can target a Space (visibility_credit_purchases.space_id, set
--   only by the payment server after checking the buyer manages the Space).
--   The paid credits land in the Space's wallet instead of the buyer's.
-- * Space credits are Explore-only: posts, adverts and sending credits.
--
-- grant_purchased_visibility_credits is copied verbatim from
-- 20260826230000_repair_monime_visibility_credit_grant.sql; only the marked
-- Space branch is new. Safe to re-run; one transaction.

begin;

alter table public.explore_space_credit_transactions
  drop constraint if exists explore_space_credit_transactions_transaction_type_check;

alter table public.explore_space_credit_transactions
  add constraint explore_space_credit_transactions_transaction_type_check
  check (transaction_type in (
    'starter_bonus',
    'invite_reward',
    'boost_spend',
    'admin_adjustment',
    'refund',
    'credit_transfer_sent',
    'purchase'
  ));

alter table public.visibility_credit_purchases
  add column if not exists space_id uuid references public.explore_spaces(id) on delete set null;

-- Who may spend, send or buy for a Space: its owner or an active
-- administrator. Takes the user explicitly so the payment grant (which runs
-- without auth.uid()) can use it too.
create or replace function public.explore_space_user_manages_credits(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.explore_spaces space
    where space.id = p_space_id and space.owner_user_id = p_user_id
  ) or exists (
    select 1 from public.explore_space_members member
    where member.space_id = p_space_id
      and member.user_id = p_user_id
      and member.status = 'active'
      and member.role in ('owner', 'administrator')
  );
$$;

revoke all on function public.explore_space_user_manages_credits(uuid, uuid) from public, anon, authenticated;

create or replace function public.transfer_space_visibility_credits(
  p_space_id uuid,
  p_recipient_public_id text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_recipient_user_id uuid;
  v_requested_id text := upper(regexp_replace(coalesce(p_recipient_public_id, ''), '[^A-Za-z0-9]', '', 'g'));
  v_amount integer := coalesce(p_amount, 0);
  v_space public.explore_spaces;
  v_space_wallet public.explore_space_credit_wallets;
  v_recipient_wallet public.visibility_credit_wallets;
  v_space_tx public.explore_space_credit_transactions;
  v_recipient_name text;
  v_recipient_public_id text;
begin
  if v_actor_user_id is null then
    raise exception 'Sign in to share Visibility Credits.';
  end if;

  select * into v_space from public.explore_spaces where id = p_space_id;
  if v_space.id is null or not public.explore_space_user_manages_credits(p_space_id, v_actor_user_id) then
    raise exception 'Only the Space owner or an administrator can share its Visibility Credits.';
  end if;

  if v_requested_id = '' then
    raise exception 'Enter the recipient''s KunThai ID.';
  end if;

  if left(v_requested_id, 3) <> 'KTU' and length(v_requested_id) >= 4 then
    v_requested_id := 'KTU' || v_requested_id;
  end if;

  select identity.user_id, identity.public_user_id
  into v_recipient_user_id, v_recipient_public_id
  from public.kunthai_account_identities identity
  where upper(regexp_replace(identity.public_user_id, '[^A-Za-z0-9]', '', 'g')) = v_requested_id
  limit 1;

  if v_recipient_user_id is null then
    raise exception 'No KunThai user was found with that ID.';
  end if;

  if v_recipient_user_id = v_actor_user_id then
    raise exception 'You cannot share Visibility Credits with yourself.';
  end if;

  if v_amount < 1 then
    raise exception 'Enter at least 1 credit to share.';
  end if;

  -- Lock order: the Space wallet, then the personal wallet (the same order a
  -- Space-paid boost uses), so concurrent operations cannot deadlock.
  insert into public.explore_space_credit_wallets (space_id)
  values (p_space_id)
  on conflict (space_id) do nothing;

  select * into v_space_wallet
  from public.explore_space_credit_wallets
  where space_id = p_space_id
  for update;

  if coalesce(v_space_wallet.balance, 0) <= 10 then
    raise exception 'The Space needs more than 10 Visibility Credits before it can share credit.';
  end if;

  if v_amount > v_space_wallet.balance then
    raise exception 'The Space only has % Visibility Credits available.', v_space_wallet.balance;
  end if;

  insert into public.visibility_credit_wallets (user_id)
  values (v_recipient_user_id)
  on conflict (user_id) do nothing;

  perform 1 from public.visibility_credit_wallets where user_id = v_recipient_user_id for update;

  update public.explore_space_credit_wallets
  set balance = balance - v_amount,
      lifetime_spent = lifetime_spent + v_amount,
      updated_at = timezone('utc', now())
  where space_id = p_space_id
  returning * into v_space_wallet;

  update public.visibility_credit_wallets
  set balance = balance + v_amount,
      lifetime_earned = lifetime_earned + v_amount,
      updated_at = timezone('utc', now())
  where user_id = v_recipient_user_id
  returning * into v_recipient_wallet;

  insert into public.explore_space_credit_transactions (
    space_id, actor_user_id, amount, balance_after, transaction_type, surface, reference_type, metadata
  ) values (
    p_space_id, v_actor_user_id, -v_amount, v_space_wallet.balance, 'credit_transfer_sent', 'explore',
    'space_credit_transfer',
    jsonb_build_object('recipientUserId', v_recipient_user_id, 'recipientPublicId', v_recipient_public_id)
  )
  returning * into v_space_tx;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_recipient_user_id, v_amount, v_recipient_wallet.balance,
    'credit_transfer_received', 'profile', 'space_credit_transfer', v_space_tx.id,
    jsonb_build_object('senderSpaceId', p_space_id, 'senderSpaceName', v_space.name, 'actorUserId', v_actor_user_id)
  );

  select coalesce(
    nullif(profile.display_name, ''),
    nullif(users.raw_user_meta_data->>'display_name', ''),
    nullif(users.raw_user_meta_data->>'full_name', ''),
    'KunThai user'
  )
  into v_recipient_name
  from auth.users users
  left join public.explore_profiles profile on profile.user_id = users.id
  where users.id = v_recipient_user_id;

  -- Recipient: "<Space> shared N credits with you" (drives the live toast).
  insert into public.explore_notifications (
    user_id, actor_name, actor_avatar_url, type, media_type, message
  ) values (
    v_recipient_user_id,
    coalesce(nullif(v_space.name, ''), 'A KunThai Space'),
    nullif(v_space.avatar_url, ''),
    'credit_transfer',
    'credit',
    format('%s shared %s Visibility Credits with you.', coalesce(nullif(v_space.name, ''), 'A KunThai Space'), v_amount)
  );

  -- The person who pressed send keeps a record.
  insert into public.explore_notifications (
    user_id, actor_name, actor_avatar_url, type, media_type, message
  ) values (
    v_actor_user_id,
    coalesce(v_recipient_name, 'KunThai user'),
    null,
    'credit_transfer_sent',
    'credit',
    format('%s shared %s Visibility Credits with %s.', coalesce(nullif(v_space.name, ''), 'Your Space'), v_amount, coalesce(v_recipient_name, 'a KunThai user'))
  );

  return jsonb_build_object(
    'status', 'completed',
    'transferId', v_space_tx.id,
    'amount', v_amount,
    'senderBalance', v_space_wallet.balance,
    'recipientName', coalesce(v_recipient_name, 'KunThai user'),
    'recipientPublicId', v_recipient_public_id
  );
end;
$$;

revoke all on function public.transfer_space_visibility_credits(uuid, text, integer) from public, anon;
grant execute on function public.transfer_space_visibility_credits(uuid, text, integer) to authenticated;

-- Purchases: unchanged except the Space branch.
create or replace function public.grant_purchased_visibility_credits(
  p_purchase_id uuid,
  p_provider_reference text,
  p_provider_transaction_id text,
  p_verified_amount_minor bigint,
  p_verified_currency text
)
returns public.visibility_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.visibility_credit_purchases;
  v_wallet public.visibility_credit_wallets;
  v_space_wallet public.explore_space_credit_wallets;
begin
  select * into v_purchase
  from public.visibility_credit_purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'Unknown Visibility Credit purchase.';
  end if;

  if v_purchase.provider not in ('flutterwave', 'monime')
    or v_purchase.provider_reference <> btrim(coalesce(p_provider_reference, ''))
    or v_purchase.amount_minor <> p_verified_amount_minor
    or v_purchase.currency <> upper(btrim(coalesce(p_verified_currency, '')))
  then
    raise exception 'Verified payment details do not match the purchase.';
  end if;

  if btrim(coalesce(p_provider_transaction_id, '')) = '' then
    raise exception 'A verified payment transaction ID is required.';
  end if;

  if v_purchase.status = 'paid' then
    select * into v_wallet
    from public.visibility_credit_wallets
    where user_id = v_purchase.user_id;
    return v_wallet;
  end if;

  if v_purchase.status in ('refunded', 'expired') then
    raise exception 'This purchase can no longer be completed.';
  end if;

  update public.visibility_credit_purchases
  set status = 'paid',
      provider_transaction_id = btrim(p_provider_transaction_id),
      paid_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;

  -- A purchase made for a Space fills the Space's wallet, provided the buyer
  -- still manages that Space when the payment is confirmed; otherwise the
  -- credits fall through to the buyer's own wallet below, never lost.
  if v_purchase.space_id is not null
    and public.explore_space_user_manages_credits(v_purchase.space_id, v_purchase.user_id)
  then
    insert into public.explore_space_credit_wallets (space_id, balance, lifetime_earned)
    values (v_purchase.space_id, v_purchase.credits, v_purchase.credits)
    on conflict (space_id) do update
      set balance = public.explore_space_credit_wallets.balance + excluded.balance,
          lifetime_earned = public.explore_space_credit_wallets.lifetime_earned + excluded.lifetime_earned,
          updated_at = timezone('utc', now())
    returning * into v_space_wallet;

    insert into public.explore_space_credit_transactions (
      space_id, actor_user_id, amount, balance_after, transaction_type, surface,
      reference_type, reference_id, metadata
    ) values (
      v_purchase.space_id,
      v_purchase.user_id,
      v_purchase.credits,
      v_space_wallet.balance,
      'purchase',
      'explore',
      'visibility_credit_purchase',
      v_purchase.id,
      jsonb_build_object(
        'provider', v_purchase.provider,
        'providerReference', v_purchase.provider_reference,
        'providerTransactionId', btrim(p_provider_transaction_id),
        'amountMinor', v_purchase.amount_minor,
        'currency', v_purchase.currency
      )
    );

    select * into v_wallet
    from public.visibility_credit_wallets
    where user_id = v_purchase.user_id;
    return v_wallet;
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_purchase.user_id, v_purchase.credits, v_purchase.credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface,
    reference_type, reference_id, metadata
  ) values (
    v_purchase.user_id,
    v_purchase.credits,
    v_wallet.balance,
    'purchase',
    'profile',
    'visibility_credit_purchase',
    v_purchase.id,
    jsonb_build_object(
      'provider', v_purchase.provider,
      'providerReference', v_purchase.provider_reference,
      'providerTransactionId', btrim(p_provider_transaction_id),
      'amountMinor', v_purchase.amount_minor,
      'currency', v_purchase.currency
    )
  );

  return v_wallet;
end;
$$;

commit;

-- Give the SENDER of a Visibility Credit transfer their own in-app notification,
-- matching the one the recipient already receives. Previously only the recipient
-- got an explore_notifications row (and the sender saw a one-off toast that did
-- not persist), so a sender had no lasting record that they shared credits.
--
-- The sender row uses a distinct type ('credit_transfer_sent') so the client's
-- live "you received credits" toast — which listens for the recipient-side
-- 'credit_transfer' type — never fires for the person who did the sending.
--
-- This re-creates transfer_visibility_credits identically to
-- 20260809100000_visibility_credit_transfers.sql and only adds the sender
-- notification insert before the return.

create or replace function public.transfer_visibility_credits(
  p_recipient_public_id text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sender_user_id uuid := auth.uid();
  v_recipient_user_id uuid;
  v_requested_id text := upper(regexp_replace(coalesce(p_recipient_public_id, ''), '[^A-Za-z0-9]', '', 'g'));
  v_amount integer := coalesce(p_amount, 0);
  v_transfer public.visibility_credit_transfers;
  v_sender_wallet public.visibility_credit_wallets;
  v_recipient_wallet public.visibility_credit_wallets;
  v_sender_name text;
  v_sender_avatar_url text;
  v_recipient_name text;
  v_recipient_public_id text;
begin
  if v_sender_user_id is null then
    raise exception 'Sign in to share Visibility Credits.';
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

  if v_recipient_user_id = v_sender_user_id then
    raise exception 'You cannot share Visibility Credits with yourself.';
  end if;

  if v_amount < 1 then
    raise exception 'Enter at least 1 credit to share.';
  end if;

  -- Ensure both rows exist before locking them in UUID order. This prevents two
  -- users who share credits with each other at the same moment from deadlocking.
  insert into public.visibility_credit_wallets (user_id)
  values (v_sender_user_id), (v_recipient_user_id)
  on conflict (user_id) do nothing;

  perform wallet.user_id
  from public.visibility_credit_wallets wallet
  where wallet.user_id in (v_sender_user_id, v_recipient_user_id)
  order by wallet.user_id
  for update;

  select * into v_sender_wallet
  from public.visibility_credit_wallets
  where user_id = v_sender_user_id;

  if coalesce(v_sender_wallet.balance, 0) <= 10 then
    raise exception 'You need more than 10 Visibility Credits before you can share credit.';
  end if;

  if v_amount > v_sender_wallet.balance then
    raise exception 'You only have % Visibility Credits available.', v_sender_wallet.balance;
  end if;

  update public.visibility_credit_wallets
  set balance = balance - v_amount,
      lifetime_spent = lifetime_spent + v_amount,
      updated_at = timezone('utc', now())
  where user_id = v_sender_user_id
  returning * into v_sender_wallet;

  update public.visibility_credit_wallets
  set balance = balance + v_amount,
      lifetime_earned = lifetime_earned + v_amount,
      updated_at = timezone('utc', now())
  where user_id = v_recipient_user_id
  returning * into v_recipient_wallet;

  insert into public.visibility_credit_transfers (
    sender_user_id, recipient_user_id, amount
  ) values (
    v_sender_user_id, v_recipient_user_id, v_amount
  )
  returning * into v_transfer;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface,
    reference_type, reference_id, metadata
  ) values
  (
    v_sender_user_id, -v_amount, v_sender_wallet.balance,
    'credit_transfer_sent', 'profile', 'visibility_credit_transfer', v_transfer.id,
    jsonb_build_object('recipientUserId', v_recipient_user_id, 'recipientPublicId', v_recipient_public_id)
  ),
  (
    v_recipient_user_id, v_amount, v_recipient_wallet.balance,
    'credit_transfer_received', 'profile', 'visibility_credit_transfer', v_transfer.id,
    jsonb_build_object('senderUserId', v_sender_user_id)
  );

  select
    coalesce(nullif(profile.display_name, ''), nullif(users.raw_user_meta_data->>'display_name', ''), 'A KunThai user'),
    coalesce(nullif(profile.avatar_url, ''), nullif(users.raw_user_meta_data->>'avatar_url', ''))
  into v_sender_name, v_sender_avatar_url
  from auth.users users
  left join public.explore_profiles profile on profile.user_id = users.id
  where users.id = v_sender_user_id;

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

  -- Recipient notification (drives the live "you received credits" toast).
  insert into public.explore_notifications (
    user_id, actor_name, actor_avatar_url, type, media_type, message
  ) values (
    v_recipient_user_id,
    coalesce(v_sender_name, 'A KunThai user'),
    v_sender_avatar_url,
    'credit_transfer',
    'credit',
    format('%s shared %s Visibility Credits with you.', coalesce(v_sender_name, 'A KunThai user'), v_amount)
  );

  -- Sender notification: a lasting record that they shared credits. Distinct
  -- type so it does not trigger the recipient-side received-credits toast.
  insert into public.explore_notifications (
    user_id, actor_name, actor_avatar_url, type, media_type, message
  ) values (
    v_sender_user_id,
    coalesce(v_recipient_name, 'KunThai user'),
    null,
    'credit_transfer_sent',
    'credit',
    format('You shared %s Visibility Credits with %s.', v_amount, coalesce(v_recipient_name, 'a KunThai user'))
  );

  return jsonb_build_object(
    'status', 'completed',
    'transferId', v_transfer.id,
    'amount', v_amount,
    'senderBalance', v_sender_wallet.balance,
    'recipientName', coalesce(v_recipient_name, 'KunThai user'),
    'recipientPublicId', v_recipient_public_id
  );
end;
$$;

revoke all on function public.transfer_visibility_credits(text, integer) from public, anon;
grant execute on function public.transfer_visibility_credits(text, integer) to authenticated;

-- Apple In-App Purchase for Visibility Credits (2026-10-14).
--
-- The KunThai iOS app sells Visibility Credits through Apple In-App Purchase
-- (consumable products app.kunthai.mobile.credits.75/150/225/300). The server
-- (server/payments/apple-verify-purchase.js) verifies each StoreKit 2 signed
-- transaction against Apple's certificate chain, then calls
-- apple_grant_visibility_credits(); Apple's refund notifications
-- (server/payments/apple-notifications.js) call
-- apple_revoke_visibility_credits(). Both functions are service-role only.
--
-- Changes to existing objects, all additive:
--   * visibility_credit_purchases.provider also allows 'apple';
--   * visibility_credit_transactions.transaction_type also allows
--     'purchase_reversal' (credits taken back after an Apple refund);
--   * grant_purchased_visibility_credits(): copied verbatim from production,
--     with 'apple' added to its provider list. Monime and Flutterwave
--     purchases behave exactly as before.
--
-- One purchase row per Apple transaction (unique provider + reference =
-- transactionId), so a transaction is never credited twice. Re-runnable.

begin;

alter table public.visibility_credit_purchases drop constraint if exists visibility_credit_purchases_provider_check;
alter table public.visibility_credit_purchases add constraint visibility_credit_purchases_provider_check
  check (provider = any (array['flutterwave'::text, 'monime'::text, 'apple'::text]));

alter table public.visibility_credit_transactions drop constraint if exists visibility_credit_transactions_transaction_type_check;
alter table public.visibility_credit_transactions add constraint visibility_credit_transactions_transaction_type_check
  check (transaction_type = any (array['invite_reward'::text, 'boost_spend'::text, 'admin_adjustment'::text, 'refund'::text,
    'starter_bonus'::text, 'credit_transfer_sent'::text, 'credit_transfer_received'::text, 'purchase'::text,
    'subscription_spend'::text, 'subscription_refund'::text, 'operator_company_access'::text, 'purchase_reversal'::text]));

-- Latest definition (production), only 'apple' added to the provider list.
CREATE OR REPLACE FUNCTION public.grant_purchased_visibility_credits(p_purchase_id uuid, p_provider_reference text, p_provider_transaction_id text, p_verified_amount_minor bigint, p_verified_currency text)
 RETURNS visibility_credit_wallets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_purchase.provider not in ('flutterwave', 'monime', 'apple')
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
$function$;

-- A verified Apple transaction -> one purchase row, then the shared grant.
-- p_user_id is the Apple appAccountToken the server already matched to the
-- signed-in account; a transaction already recorded for another account is refused.
create or replace function public.apple_grant_visibility_credits(
  p_user_id uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_product_id text,
  p_credits integer,
  p_amount_minor bigint,
  p_currency text,
  p_environment text,
  p_storefront text default ''
)
returns public.visibility_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := btrim(coalesce(p_transaction_id, ''));
  v_purchase public.visibility_credit_purchases;
begin
  if p_user_id is null or v_reference = '' or coalesce(p_credits, 0) <= 0 or coalesce(p_amount_minor, 0) <= 0 then
    raise exception 'Invalid Apple purchase.';
  end if;

  insert into public.visibility_credit_purchases (user_id, credits, amount_minor, currency, provider, provider_reference, status, metadata)
  values (p_user_id, p_credits, p_amount_minor, upper(btrim(p_currency)), 'apple', v_reference, 'pending',
          jsonb_build_object('productId', p_product_id, 'originalTransactionId', p_original_transaction_id,
                             'environment', p_environment, 'storefront', coalesce(p_storefront, '')))
  on conflict (provider, provider_reference) do nothing;

  select * into v_purchase
  from public.visibility_credit_purchases
  where provider = 'apple' and provider_reference = v_reference;

  if v_purchase.user_id is distinct from p_user_id then
    raise exception 'This App Store purchase belongs to another account.';
  end if;

  return public.grant_purchased_visibility_credits(
    v_purchase.id, v_reference, v_reference, v_purchase.amount_minor, v_purchase.currency
  );
end;
$$;

-- Apple refunded or revoked a transaction: take the credits back (never below
-- zero; any shortfall is recorded) and mark the purchase refunded. Unknown or
-- already refunded transactions are ignored.
create or replace function public.apple_revoke_visibility_credits(p_transaction_id text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.visibility_credit_purchases;
  v_wallet public.visibility_credit_wallets;
  v_taken integer;
begin
  select * into v_purchase
  from public.visibility_credit_purchases
  where provider = 'apple' and provider_reference = btrim(coalesce(p_transaction_id, ''))
  for update;

  if v_purchase.id is null or v_purchase.status = 'refunded' then
    return;
  end if;

  if v_purchase.status = 'paid' then
    select * into v_wallet from public.visibility_credit_wallets where user_id = v_purchase.user_id for update;
    v_taken := least(coalesce(v_wallet.balance, 0), v_purchase.credits);
    update public.visibility_credit_wallets
    set balance = balance - v_taken,
        lifetime_earned = greatest(lifetime_earned - v_purchase.credits, 0),
        updated_at = timezone('utc', now())
    where user_id = v_purchase.user_id
    returning * into v_wallet;

    insert into public.visibility_credit_transactions (
      user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
    ) values (
      v_purchase.user_id, -v_taken, coalesce(v_wallet.balance, 0), 'purchase_reversal', 'profile',
      'visibility_credit_purchase', v_purchase.id,
      jsonb_build_object('provider', 'apple', 'providerReference', v_purchase.provider_reference,
                         'reason', coalesce(p_reason, ''), 'creditsPurchased', v_purchase.credits,
                         'shortfall', v_purchase.credits - v_taken)
    );
  end if;

  update public.visibility_credit_purchases
  set status = 'refunded',
      metadata = metadata || jsonb_build_object('refundReason', coalesce(p_reason, ''), 'refundedAt', timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;
end;
$$;

revoke all on function public.apple_grant_visibility_credits(uuid, text, text, text, integer, bigint, text, text, text) from public;
revoke all on function public.apple_revoke_visibility_credits(text, text) from public;
do $$ begin
  revoke all on function public.apple_grant_visibility_credits(uuid, text, text, text, integer, bigint, text, text, text) from anon, authenticated;
  revoke all on function public.apple_revoke_visibility_credits(text, text) from anon, authenticated;
exception when undefined_object then null;
end $$;
grant execute on function public.apple_grant_visibility_credits(uuid, text, text, text, integer, bigint, text, text, text) to service_role;
grant execute on function public.apple_revoke_visibility_credits(text, text) to service_role;

commit;

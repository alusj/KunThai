-- Production repair: the live grant function was still the Flutterwave-only
-- version even though Monime purchases and payment codes were already enabled.
-- Recreate the atomic/idempotent grant so a verified Orange Money or Afrimoney
-- payment can credit the buyer's wallet.

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

revoke all on function public.grant_purchased_visibility_credits(
  uuid, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.grant_purchased_visibility_credits(
  uuid, text, text, bigint, text
) to service_role;

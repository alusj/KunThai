-- Flutterwave purchases for Visibility Credits.
--
-- Prices are deliberately not seeded here. Charging real money is a business
-- decision, so an administrator must insert the approved packages explicitly.
-- The browser can only select an active package; it can never submit a price or
-- credit amount.

alter table public.visibility_credit_transactions
  drop constraint if exists visibility_credit_transactions_transaction_type_check;

alter table public.visibility_credit_transactions
  add constraint visibility_credit_transactions_transaction_type_check
  check (transaction_type in (
    'invite_reward',
    'boost_spend',
    'admin_adjustment',
    'refund',
    'starter_bonus',
    'credit_transfer_sent',
    'credit_transfer_received',
    'purchase'
  ));

create table if not exists public.visibility_credit_packages (
  id uuid primary key default gen_random_uuid(),
  credits integer not null check (credits > 0),
  price_minor bigint not null check (price_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  label text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (credits, price_minor, currency)
);

alter table public.visibility_credit_packages enable row level security;

drop policy if exists "Anyone reads active credit packages"
  on public.visibility_credit_packages;
create policy "Anyone reads active credit packages"
on public.visibility_credit_packages for select to anon, authenticated
using (active = true);

grant select on public.visibility_credit_packages to anon, authenticated;
revoke insert, update, delete on public.visibility_credit_packages from anon, authenticated;

create table if not exists public.visibility_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid references public.visibility_credit_packages(id) on delete set null,
  credits integer not null check (credits > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider text not null check (provider in ('flutterwave')),
  provider_reference text not null,
  provider_transaction_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz
);

create unique index if not exists visibility_credit_purchases_provider_ref_uidx
  on public.visibility_credit_purchases (provider, provider_reference);
create unique index if not exists visibility_credit_purchases_provider_tx_uidx
  on public.visibility_credit_purchases (provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists visibility_credit_purchases_user_idx
  on public.visibility_credit_purchases (user_id, created_at desc);
create index if not exists visibility_credit_purchases_pending_idx
  on public.visibility_credit_purchases (created_at)
  where status = 'pending';

alter table public.visibility_credit_purchases enable row level security;

drop policy if exists "Users read own credit purchases"
  on public.visibility_credit_purchases;
create policy "Users read own credit purchases"
on public.visibility_credit_purchases for select to authenticated
using (user_id = auth.uid());

grant select on public.visibility_credit_purchases to authenticated;
revoke insert, update, delete on public.visibility_credit_purchases from anon, authenticated;

-- Called only after the server has queried Flutterwave's verification API and
-- checked the status, amount, currency, and transaction reference. The same
-- purchase row is locked and marked paid in the wallet update transaction, so
-- webhook retries and return-page verification cannot double-credit a wallet.
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

  if v_purchase.provider <> 'flutterwave'
    or v_purchase.provider_reference <> btrim(coalesce(p_provider_reference, ''))
    or v_purchase.amount_minor <> p_verified_amount_minor
    or v_purchase.currency <> upper(btrim(coalesce(p_verified_currency, '')))
  then
    raise exception 'Verified payment details do not match the purchase.';
  end if;

  if btrim(coalesce(p_provider_transaction_id, '')) = '' then
    raise exception 'A verified Flutterwave transaction ID is required.';
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

-- Example only. Replace the numbers with approved pricing before running it:
-- insert into public.visibility_credit_packages
--   (credits, price_minor, currency, label, sort_order)
-- values
--   (10,  99, 'USD', 'Starter', 1),
--   (50, 399, 'USD', 'Growth',  2);


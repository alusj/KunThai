-- ============================================================================
-- DRAFT / PROPOSAL — NOT YET APPLIED.
-- Kept outside supabase/migrations/ on purpose so `supabase db push` ignores it.
-- Move it into supabase/migrations/ (with a real timestamp) only after you have
-- chosen a payment provider and confirmed the credit packages / pricing below.
-- ============================================================================
--
-- Purpose: let a user BUY Visibility Credits in addition to earning them from
-- invites. Provider-agnostic: the database only knows about purchases, packages,
-- and an idempotent credit-grant that a verified payment webhook calls.
--
-- Money never touches the browser. The client only ever:
--   1. reads active packages,
--   2. asks the server to create a PENDING purchase (server sets the price),
--   3. is redirected to the provider to pay.
-- The provider then calls our webhook, which verifies the signature and calls
-- grant_purchased_visibility_credits() with the service-role key.
-- ----------------------------------------------------------------------------

-- 1) Allow 'purchase' as a credit transaction source. NOTE: 'starter_bonus' is
--    kept because the live table already uses it (added out-of-band); dropping it
--    would break existing rows.
alter table public.visibility_credit_transactions
  drop constraint if exists visibility_credit_transactions_transaction_type_check;
alter table public.visibility_credit_transactions
  add constraint visibility_credit_transactions_transaction_type_check
  check (transaction_type in ('invite_reward', 'boost_spend', 'admin_adjustment', 'refund', 'starter_bonus', 'purchase'));

-- 2) Server-authoritative credit packages (what a user can buy, and for how much).
--    EDIT these seed rows to your real pricing before applying.
create table if not exists public.visibility_credit_packages (
  id uuid primary key default gen_random_uuid(),
  credits integer not null check (credits > 0),
  price_minor bigint not null check (price_minor > 0),  -- price in the currency's smallest unit (e.g. cents, kobo)
  currency text not null,                               -- ISO 4217, e.g. 'NGN', 'GHS', 'USD', 'SLE'
  label text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.visibility_credit_packages enable row level security;

drop policy if exists "Anyone reads active credit packages" on public.visibility_credit_packages;
create policy "Anyone reads active credit packages"
on public.visibility_credit_packages for select to anon, authenticated
using (active = true);

-- EXAMPLE packages only — replace with your real numbers.
-- Global model: a USD set covers all 252 countries (buyer's bank converts).
-- Add local-currency rows for your biggest markets for friendlier pricing.
-- price_minor is in the currency's smallest unit: USD cents, NGN kobo, SLE cents, etc.
insert into public.visibility_credit_packages (credits, price_minor, currency, label, sort_order)
values
  -- Worldwide (USD) — used for buyers outside your local-currency markets.
  (10,   99, 'USD', 'Starter - 10 credits', 1),
  (50,  399, 'USD', 'Grow - 50 credits',    2),
  (150, 999, 'USD', 'Pro - 150 credits',    3),
  -- Optional local-currency examples (add more markets as needed).
  (10,  1000, 'SLE', 'Starter - 10 credits', 11),
  (50,  4500, 'SLE', 'Grow - 50 credits',    12),
  (150, 12000,'SLE', 'Pro - 150 credits',    13)
on conflict do nothing;

-- 3) Purchase records. One row per checkout attempt; provider_reference is the
--    idempotency key that ties a provider transaction to exactly one grant.
create table if not exists public.visibility_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid references public.visibility_credit_packages(id) on delete set null,
  credits integer not null check (credits > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  provider text not null,                    -- 'flutterwave' | 'paystack' | 'stripe' | ...
  provider_reference text,                   -- provider's transaction id/ref; set when known
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz
);

create unique index if not exists visibility_credit_purchases_provider_ref_uidx
  on public.visibility_credit_purchases (provider, provider_reference)
  where provider_reference is not null;
create index if not exists visibility_credit_purchases_user_idx
  on public.visibility_credit_purchases (user_id, created_at desc);

alter table public.visibility_credit_purchases enable row level security;

drop policy if exists "Users read own credit purchases" on public.visibility_credit_purchases;
create policy "Users read own credit purchases"
on public.visibility_credit_purchases for select to authenticated
using (user_id = auth.uid());
-- No insert/update/delete policy: only service_role (webhook) and the RPCs below write.

-- 4) Client-callable: create a PENDING purchase from a package. The server reads
--    the authoritative price; the client cannot choose its own amount.
create or replace function public.create_visibility_credit_purchase(
  p_package_id uuid,
  p_provider text
)
returns public.visibility_credit_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg public.visibility_credit_packages;
  v_purchase public.visibility_credit_purchases;
begin
  if auth.uid() is null then
    raise exception 'Sign in to buy Visibility Credits.';
  end if;

  select * into v_pkg from public.visibility_credit_packages
  where id = p_package_id and active = true;
  if v_pkg.id is null then
    raise exception 'That credit package is not available.';
  end if;

  insert into public.visibility_credit_purchases (
    user_id, package_id, credits, amount_minor, currency, provider, status
  ) values (
    auth.uid(), v_pkg.id, v_pkg.credits, v_pkg.price_minor, v_pkg.currency,
    lower(btrim(coalesce(p_provider, ''))), 'pending'
  )
  returning * into v_purchase;

  return v_purchase;
end;
$$;

revoke all on function public.create_visibility_credit_purchase(uuid, text) from public;
grant execute on function public.create_visibility_credit_purchase(uuid, text) to authenticated;

-- 5) Webhook-callable (service-role only): idempotently mark a purchase paid and
--    credit the wallet. Safe to call multiple times for the same purchase.
create or replace function public.grant_purchased_visibility_credits(
  p_purchase_id uuid,
  p_provider_reference text default null
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
  select * into v_purchase from public.visibility_credit_purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'Unknown purchase.';
  end if;

  -- Idempotent: already granted -> just return the current wallet.
  if v_purchase.status = 'paid' then
    select * into v_wallet from public.visibility_credit_wallets where user_id = v_purchase.user_id;
    return v_wallet;
  end if;

  update public.visibility_credit_purchases
  set status = 'paid',
      paid_at = timezone('utc', now()),
      provider_reference = coalesce(provider_reference, p_provider_reference)
  where id = v_purchase.id;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_purchase.user_id, v_purchase.credits, v_purchase.credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_purchase.user_id, v_purchase.credits, v_wallet.balance, 'purchase', 'platform',
    'visibility_credit_purchase', v_purchase.id,
    jsonb_build_object('provider', v_purchase.provider, 'amountMinor', v_purchase.amount_minor, 'currency', v_purchase.currency)
  );

  return v_wallet;
end;
$$;

-- Only the service role (the webhook) may grant credits — never the browser.
revoke all on function public.grant_purchased_visibility_credits(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_purchased_visibility_credits(uuid, text) to service_role;

grant select on public.visibility_credit_packages to anon, authenticated;
grant select on public.visibility_credit_purchases to authenticated;

-- Every real KunThai account starts with 5 Visibility Credits. Guests
-- (anonymous sessions) are excluded. The grant is idempotent: it is keyed on a
-- single 'starter_bonus' transaction per user, so re-running or repeated auth
-- updates never double-credit.

create or replace function public.grant_kunthai_starter_credits(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.visibility_credit_wallets;
begin
  if p_user_id is null then
    return;
  end if;

  -- Never grant to anonymous guests.
  if exists (select 1 from auth.users u where u.id = p_user_id and u.is_anonymous) then
    return;
  end if;

  -- Already granted once — nothing to do.
  if exists (
    select 1 from public.visibility_credit_transactions
    where user_id = p_user_id and transaction_type = 'starter_bonus'
  ) then
    return;
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (p_user_id, 5, 5)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + 5,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + 5,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, metadata
  ) values (
    p_user_id, 5, v_wallet.balance, 'starter_bonus', 'platform', 'account_creation',
    jsonb_build_object('reason', 'welcome_bonus')
  );
end;
$$;

create or replace function public.trigger_grant_starter_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fires on signup and again if a guest later upgrades to a real account.
  if new.is_anonymous is not true then
    perform public.grant_kunthai_starter_credits(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists grant_starter_credits_on_auth_user on auth.users;
create trigger grant_starter_credits_on_auth_user
after insert or update of is_anonymous, email_confirmed_at, phone_confirmed_at
on auth.users
for each row execute function public.trigger_grant_starter_credits();

-- Backfill: give every existing real account its starter bonus if it never had one.
do $$
declare
  u record;
begin
  for u in
    select id from auth.users
    where is_anonymous is not true
      and not exists (
        select 1 from public.visibility_credit_transactions t
        where t.user_id = auth.users.id and t.transaction_type = 'starter_bonus'
      )
  loop
    perform public.grant_kunthai_starter_credits(u.id);
  end loop;
end $$;

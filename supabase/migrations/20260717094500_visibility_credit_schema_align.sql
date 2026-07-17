-- The first Visibility Credits deployment created visibility_credit_transactions
-- with a "reason" column; the repo migration and every credit function write
-- "transaction_type". Against that table both invite crediting and credit
-- spending failed with "column does not exist". Align the live schema with the
-- functions, keeping the historical starter_bonus rows valid.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visibility_credit_transactions'
      and column_name = 'reason'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visibility_credit_transactions'
      and column_name = 'transaction_type'
  ) then
    alter table public.visibility_credit_transactions rename column reason to transaction_type;
  end if;
end $$;

alter table public.visibility_credit_transactions
  drop constraint if exists visibility_credit_transactions_transaction_type_check;

alter table public.visibility_credit_transactions
  add constraint visibility_credit_transactions_transaction_type_check
  check (transaction_type in ('invite_reward', 'boost_spend', 'admin_adjustment', 'refund', 'starter_bonus'));

-- A person whose UrRide operator profile was removed joins a company as a new
-- operator (2026-10-30).
--
-- The one-time 150 Visibility Credit company access fee is for solo
-- operators (transport_operator_company_access.solo_started_at, set when they
-- first ran their own vehicle). That mark outlived the operator profile: a
-- business account that once registered solo, then removed its operator
-- profile, was still asked for the fee when a company invited it, and the
-- invitation could not be accepted. Once no operator profile is left, the mark
-- is cleared (only while the fee was never settled), so the person joins like
-- anyone new.
--
-- Later the same day the fee was made the same for everyone, new or solo
-- (20261030110000_urride_company_access_fee_for_everyone.sql); the solo mark
-- now only records history.
begin;

create or replace function public.transport_forget_solo_when_operator_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := old.user_id;
begin
  if v_user is null then return null; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return null; end if;
  if exists (select 1 from public.transport_operators where user_id = v_user) then return null; end if;
  update public.transport_operator_company_access
  set solo_started_at = null
  where user_id = v_user and unlocked_at is null and solo_started_at is not null;
  return null;
end;
$$;

drop trigger if exists transport_forget_solo_when_operator_removed on public.transport_operators;
create trigger transport_forget_solo_when_operator_removed
after delete or update of user_id on public.transport_operators
for each row execute function public.transport_forget_solo_when_operator_removed();

-- Profiles already removed.
update public.transport_operator_company_access access
set solo_started_at = null
where access.unlocked_at is null
  and access.solo_started_at is not null
  and not exists (select 1 from public.transport_operators operator where operator.user_id = access.user_id);

commit;

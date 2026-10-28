-- A company adds an operator once (2026-10-27). One open invitation
-- (pending and not yet expired, or accepted) per person per company, whichever
-- vehicle it is for. The app checks first and explains; this is the guard for
-- every other path (two devices at once, older app versions, direct writes).
--
-- Only new or reopened invitations are checked: a pending invitation being
-- accepted, or documents being added to an accepted one, always goes through,
-- so a company with older duplicates keeps working.
begin;

create or replace function public.transport_company_operator_once()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_open boolean;
  v_user uuid;
  v_name text;
begin
  v_open := new.status = 'accepted'
    or (new.status = 'pending' and coalesce(new.created_at, now()) > now() - interval '30 days');
  if not v_open then return new; end if;

  -- Accepting, or filling in the operator on accept, is not adding anyone.
  if tg_op = 'UPDATE' and old.status in ('pending', 'accepted')
    and new.company_id is not distinct from old.company_id then
    return new;
  end if;

  v_user := new.operator_user_id;
  if v_user is null and new.operator_id is not null then
    select user_id into v_user from public.transport_operators where id = new.operator_id;
  end if;

  -- Two managers inviting the same person at the same moment queue here.
  perform pg_advisory_xact_lock(hashtext('transport_company_operator_once:' || new.company_id::text));

  if exists (
    select 1
    from public.transport_company_operator_invites invite
    left join public.transport_operators operator on operator.id = invite.operator_id
    where invite.company_id = new.company_id
      and invite.id <> new.id
      and (invite.status = 'accepted'
        or (invite.status = 'pending' and invite.created_at > now() - interval '30 days'))
      and (
        (v_user is not null and coalesce(invite.operator_user_id, operator.user_id) = v_user)
        or (new.operator_id is not null and invite.operator_id = new.operator_id)
        or (nullif(new.operator_public_id, '') is not null
          and upper(regexp_replace(invite.operator_public_id, '[^a-zA-Z0-9]', '', 'g'))
            = upper(regexp_replace(new.operator_public_id, '[^a-zA-Z0-9]', '', 'g')))
      )
  ) then
    v_name := coalesce(nullif(new.operator_name, ''), nullif(new.operator_public_id, ''), 'This operator');
    raise exception '% is already on your team. A company can add an operator only once.', v_name
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists transport_company_operator_once_trigger on public.transport_company_operator_invites;
create trigger transport_company_operator_once_trigger
before insert or update of status, company_id, operator_user_id, operator_id, operator_public_id
on public.transport_company_operator_invites
for each row execute function public.transport_company_operator_once();

commit;

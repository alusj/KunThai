-- Verification cases finish only through a decision.
--
-- Moving a verification case to Resolved or Closed with "Change status" left
-- the record behind it untouched: KunThai Transport's case was resolved on
-- 14 July with the note "your account has been verified", yet the company
-- stayed 'pending' and the case never came back to the queue.
--
--  1. admin_transition_case refuses Resolved and Closed for verification
--     cases; Approve, Reject or another decision must be used.
--  2. One-time: verification cases resolved or closed without any decision
--     go back to the queue (status 'new', the reviewer stays assigned).
--
-- Latest definition of admin_transition_case before this:
-- 20260627120000_kunthai_admin_foundation.sql
-- Safe to run more than once.

begin;

create or replace function public.admin_transition_case(
  case_uuid uuid,
  next_status text,
  transition_note text default ''
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_case public.admin_cases;
  updated_case public.admin_cases;
begin
  select * into previous_case from public.admin_cases where id = case_uuid for update;
  if previous_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', previous_case.sector) then raise exception 'Not authorized'; end if;
  if next_status not in ('new','triaged','assigned','in_review','waiting_information','action_proposed','approval_required','actioned','appeal_window','resolved','closed','reopened') then
    raise exception 'Invalid case status';
  end if;
  if previous_case.queue = 'verification'
     and next_status in ('resolved', 'closed')
     and previous_case.status is distinct from next_status then
    raise exception 'Verification cases are finished with a decision. Use Approve, Reject or another decision instead of changing the status.';
  end if;

  update public.admin_cases
  set status = next_status,
      updated_at = now(),
      resolved_at = case when next_status = 'resolved' then now() else resolved_at end,
      closed_at = case when next_status = 'closed' then now() else closed_at end,
      resolution_note = case when next_status in ('resolved','closed') then nullif(btrim(transition_note), '') else resolution_note end
  where id = case_uuid
  returning * into updated_case;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary)
  values (case_uuid, auth.uid(), 'status_changed', previous_case.status, next_status, coalesce(nullif(btrim(transition_note), ''), 'Case status updated'));
  perform public.admin_log_action('case.status_changed', updated_case.sector, updated_case.resource_type, updated_case.resource_id, case_uuid, transition_note, to_jsonb(previous_case), to_jsonb(updated_case));
  return updated_case;
end;
$$;

revoke all on function public.admin_transition_case(uuid, text, text) from public, anon;
grant execute on function public.admin_transition_case(uuid, text, text) to authenticated;

with reopened as (
  update public.admin_cases
  set status = 'new',
      resolved_at = null,
      closed_at = null,
      resolution_note = null,
      sla_due_at = now() + interval '24 hours',
      updated_at = now()
  where queue = 'verification'
    and status in ('resolved', 'closed')
    and resolution_code is null
  returning id, status
)
insert into public.admin_case_events(case_id, event_type, from_status, to_status, summary)
select id, 'reopened', 'resolved', 'new',
  'Back in the queue: it was resolved with Change status, so no decision reached the record. Use Approve or Reject.'
from reopened;

commit;

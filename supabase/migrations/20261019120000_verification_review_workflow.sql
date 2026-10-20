-- Verification review workflow: admins can see where every verification
-- case stands, and applicants see what KunThai still needs.
--
--  1. admin_cases keeps a review timeline: review_round (1 = first
--     submission), info_requested_at, resubmitted_at and last_reviewed_at,
--     plus metadata.reviewSnapshot (what the record looked like when an admin
--     last decided or asked for more), so the console can show what changed.
--  2. admin_verification_requests records each "more documents" request:
--     which documents, the admin's note, and when the applicant answered.
--     admin_request_verification_documents() creates one and applies the
--     existing Request information decision (which notifies the person).
--  3. A document uploaded while a case waits on the applicant moves it to
--     'reopened' (resubmitted). Any reopen marks the open request answered
--     and alerts the reviewer (or the sector's verification staff).
--  4. A UrMall seller that skipped documents at sign-up (or was rejected) and
--     uploads documents goes back to 'submitted', so a case reaches admins.
--  5. get_my_verification_requests() lets the applicant see what is needed.
--
-- Builds on 20261015090000_approve_and_recommend_decisions.sql and
-- 20260701010000_registration_admin_intake_and_evidence.sql.
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Review timeline on the case
-- ---------------------------------------------------------------------------

alter table public.admin_cases
  add column if not exists review_round integer not null default 1,
  add column if not exists info_requested_at timestamptz,
  add column if not exists resubmitted_at timestamptz,
  add column if not exists last_reviewed_at timestamptz;

-- Existing cases: waiting cases were asked at their last update; reopened
-- cases are at least a second round.
update public.admin_cases
set info_requested_at = coalesce(info_requested_at, updated_at),
    last_reviewed_at = coalesce(last_reviewed_at, updated_at)
where queue = 'verification' and status = 'waiting_information';

update public.admin_cases
set review_round = greatest(review_round, 2),
    resubmitted_at = coalesce(resubmitted_at, updated_at)
where queue = 'verification' and status = 'reopened';

update public.admin_cases
set last_reviewed_at = coalesce(last_reviewed_at, resolved_at, updated_at)
where queue = 'verification' and status in ('resolved', 'closed') and last_reviewed_at is null;

create index if not exists admin_cases_verification_stage_idx
  on public.admin_cases(queue, status, resubmitted_at)
  where queue = 'verification';

create or replace function public.admin_cases_track_review_timeline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.queue <> 'verification' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'waiting_information' then
    new.info_requested_at := now();
    new.last_reviewed_at := now();
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('reviewSnapshot', jsonb_build_object(
      'at', now(), 'decision', 'request_information', 'source', coalesce(old.metadata -> 'source', '{}'::jsonb)));
  elsif new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.last_reviewed_at := now();
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('reviewSnapshot', jsonb_build_object(
      'at', now(), 'decision', new.resolution_code, 'source', coalesce(old.metadata -> 'source', '{}'::jsonb)));
  elsif new.status = 'reopened' then
    new.review_round := coalesce(old.review_round, 1) + 1;
    new.resubmitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists admin_cases_track_review_timeline on public.admin_cases;
create trigger admin_cases_track_review_timeline
before update on public.admin_cases
for each row execute function public.admin_cases_track_review_timeline();

-- ---------------------------------------------------------------------------
-- 2. Document requests
-- ---------------------------------------------------------------------------

create table if not exists public.admin_verification_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.admin_cases(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_items text[] not null default '{}'::text[],
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'answered', 'superseded', 'closed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answer_summary jsonb not null default '{}'::jsonb
);

create index if not exists admin_verification_requests_case_idx
  on public.admin_verification_requests(case_id, created_at desc);

alter table public.admin_verification_requests enable row level security;
drop policy if exists "admins read scoped verification requests" on public.admin_verification_requests;
create policy "admins read scoped verification requests" on public.admin_verification_requests
for select to authenticated
using (exists (
  select 1 from public.admin_cases c
  where c.id = case_id and public.admin_has_permission('cases.view', c.sector)
));
revoke all on table public.admin_verification_requests from public, anon, authenticated;
grant select on table public.admin_verification_requests to authenticated;

create or replace function public.admin_request_verification_documents(
  case_uuid uuid,
  requested_items text[],
  request_note text
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.admin_cases;
  v_updated public.admin_cases;
  v_items text[];
  v_note text := btrim(coalesce(request_note, ''));
  v_reason text;
begin
  select * into v_case from public.admin_cases where id = case_uuid for update;
  if v_case.id is null then raise exception 'Case not found'; end if;
  if v_case.queue <> 'verification' then raise exception 'Only verification cases can ask for documents.'; end if;
  if not public.admin_has_permission('cases.manage', v_case.sector) then raise exception 'Not authorized'; end if;

  select coalesce(array_agg(item order by first_position), '{}'::text[]) into v_items
  from (
    select btrim(raw) as item, min(position) as first_position
    from unnest(coalesce(requested_items, '{}'::text[])) with ordinality as entry(raw, position)
    where btrim(raw) <> ''
    group by btrim(raw)
  ) cleaned;

  if cardinality(v_items) = 0 and v_note = '' then
    raise exception 'Say which documents are needed or add a note.';
  end if;

  -- The note is what the person reads in their notification.
  v_reason := concat_ws(E'\n\n',
    nullif(v_note, ''),
    case when cardinality(v_items) > 0 then 'Please send: ' || array_to_string(v_items, '; ') || '.' end
  );

  -- Asking again must notify again; the notice fires when the code changes.
  if v_case.resolution_code = 'request_information' then
    update public.admin_cases set resolution_code = null where id = case_uuid;
  end if;

  v_updated := public.admin_apply_case_decision(case_uuid, 'request_information', v_reason);

  update public.admin_verification_requests
  set status = 'superseded'
  where case_id = case_uuid and status = 'open';

  insert into public.admin_verification_requests(case_id, requested_by, requested_items, note, status)
  values (case_uuid, auth.uid(), v_items, v_note, 'open');

  return v_updated;
end;
$$;

revoke all on function public.admin_request_verification_documents(uuid, text[], text) from public, anon;
grant execute on function public.admin_request_verification_documents(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Resubmission: mark the request answered and alert the reviewer
-- ---------------------------------------------------------------------------

alter table public.admin_activity_notifications
  drop constraint if exists admin_activity_notifications_notification_type_check;
alter table public.admin_activity_notifications
  add constraint admin_activity_notifications_notification_type_check
  check (notification_type in ('admin_action', 'case_intake', 'case_resubmitted', 'system'));

create or replace function public.admin_notify_case_resubmitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requesters uuid[];
  v_documents jsonb;
begin
  if new.queue <> 'verification' or new.status <> 'reopened' or old.status = 'reopened' then
    return new;
  end if;

  select coalesce(jsonb_agg(event.metadata -> 'documentType') filter (where event.metadata ? 'documentType'), '[]'::jsonb)
    into v_documents
  from public.admin_case_events event
  where event.case_id = new.id
    and event.event_type = 'document_added'
    and event.created_at >= coalesce(new.info_requested_at, old.last_reviewed_at, new.created_at);

  update public.admin_verification_requests
  set status = 'answered',
      answered_at = now(),
      answer_summary = jsonb_build_object('documents', v_documents, 'round', new.review_round)
  where case_id = new.id and status = 'open';

  select coalesce(array_agg(distinct request.requested_by) filter (where request.requested_by is not null), '{}'::uuid[])
    into v_requesters
  from public.admin_verification_requests request
  where request.case_id = new.id;

  insert into public.admin_activity_notifications (
    recipient_user_id, notification_type, title, body, priority, case_id,
    sector, action_key, resource_type, resource_id, metadata
  )
  select recipient, 'case_resubmitted', 'Verification resubmitted',
    new.title || ' sent an update for another look.', new.priority, new.id,
    new.sector, 'case.resubmitted', new.resource_type, new.resource_id,
    jsonb_build_object('caseNumber', new.case_number, 'queue', new.queue, 'reviewRound', new.review_round)
  from (
    select new.assignee_user_id as recipient where new.assignee_user_id is not null
    union
    select unnest(v_requesters)
    union
    -- Nobody owns it yet: every verification reviewer for the sector.
    select assignment.user_id
    from public.admin_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
    where new.assignee_user_id is null
      and cardinality(v_requesters) = 0
      and role_permission.permission_key = 'verification.view'
      and public.admin_assignment_is_active(assignment)
      and ('all' = any(assignment.sector_scopes) or new.sector = any(assignment.sector_scopes))
  ) recipients
  where recipient is not null
  on conflict (recipient_user_id, case_id, notification_type) where case_id is not null
  do update set read_at = null,
    created_at = now(),
    body = excluded.body,
    priority = excluded.priority,
    metadata = excluded.metadata;

  return new;
end;
$$;

revoke all on function public.admin_notify_case_resubmitted() from public, anon, authenticated;

drop trigger if exists admin_case_notify_resubmitted on public.admin_cases;
create trigger admin_case_notify_resubmitted
after update on public.admin_cases
for each row execute function public.admin_notify_case_resubmitted();

-- ---------------------------------------------------------------------------
-- 4. Documents: keep evidence on the parent case, log each upload, and move
--    a case waiting on the applicant back for review.
-- Latest definition before this: 20260701010000_registration_admin_intake_and_evidence.sql
-- ---------------------------------------------------------------------------

-- A seller back from 'not_verified' (skipped documents) or 'rejected' may ask
-- for review again; only admins can set any other verification status.
-- Latest definition before this: 20260703100000_urmall_vertical_booking_and_admin_verification.sql
create or replace function public.guard_marketplace_business_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.admin_has_permission('marketplace.verify', 'marketplace') then
    if tg_op = 'INSERT' then
      if new.verification_status in ('verified', 'approved') then
        new.verification_status := 'pending';
      end if;
    elsif not (
      old.verification_status in ('not_verified', 'rejected')
      and new.verification_status in ('submitted', 'pending')
    ) then
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_refresh_registration_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  evidence jsonb;
  v_resource_type text;
  v_resource_id uuid;
  v_document_type text := coalesce(nullif(new.document_type, ''), 'Document');
  v_case public.admin_cases;
begin
  if tg_table_name = 'marketplace_business_documents' then
    v_resource_type := 'marketplace_business_registration';
    v_resource_id := new.business_id;

    -- Documents added after skipping them (or after a rejection) ask for a
    -- review: the business update opens or reopens its case.
    if tg_op = 'INSERT' then
      update public.marketplace_businesses
      set verification_status = 'submitted', updated_at = now()
      where id = new.business_id
        and verification_status in ('not_verified', 'rejected');
    end if;

    select coalesce(jsonb_agg(to_jsonb(document) order by document.created_at), '[]'::jsonb)
      into evidence
    from public.marketplace_business_documents document
    where document.business_id = new.business_id;
  elsif tg_table_name = 'transport_operator_documents' then
    v_resource_type := 'transport_operator_verification';
    v_resource_id := new.operator_id;

    select coalesce(jsonb_agg(to_jsonb(document) order by document.uploaded_at), '[]'::jsonb)
      into evidence
    from public.transport_operator_documents document
    where document.operator_id = new.operator_id;
  else
    return new;
  end if;

  update public.admin_cases
  set metadata = jsonb_set(metadata, '{source,registration_documents}', evidence, true),
      updated_at = now()
  where resource_type = v_resource_type
    and resource_id = v_resource_id
  returning * into v_case;

  if v_case.id is null or v_case.status in ('resolved', 'closed') then
    return new;
  end if;

  -- An update that keeps the same file is not news.
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' - 'metadata' - 'status' - 'admin_note' - 'reviewed_at' - 'reviewed_by'
       = to_jsonb(old) - 'updated_at' - 'metadata' - 'status' - 'admin_note' - 'reviewed_at' - 'reviewed_by' then
    return new;
  end if;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
  values (v_case.id, auth.uid(), 'document_added', v_case.status, v_case.status,
    case when tg_op = 'INSERT' then 'New document: ' else 'Document replaced: ' end || v_document_type,
    jsonb_build_object('documentType', v_document_type, 'documentId', new.id, 'operation', lower(tg_op)));

  if v_case.status = 'waiting_information' then
    update public.admin_cases
    set status = 'reopened',
        resolution_code = null,
        resolution_note = null,
        resolved_at = null,
        closed_at = null,
        sla_due_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_case.id;

    insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
    values (v_case.id, auth.uid(), 'reopened', 'waiting_information', 'reopened',
      'The applicant uploaded the requested documents.',
      jsonb_build_object('documentType', v_document_type));
  end if;

  return new;
end;
$$;

revoke all on function public.admin_refresh_registration_evidence() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. What the applicant sees
-- ---------------------------------------------------------------------------

create or replace function public.get_my_verification_requests()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'caseId', c.id,
      'sector', c.sector,
      'resourceType', c.resource_type,
      'resourceId', c.resource_id,
      'title', c.title,
      'stage', case when c.status = 'waiting_information' then 'needs_documents' else 'resubmitted' end,
      'note', coalesce(request.note, c.resolution_note, ''),
      'items', to_jsonb(coalesce(request.requested_items, '{}'::text[])),
      'requestedAt', coalesce(request.created_at, c.info_requested_at),
      'resubmittedAt', c.resubmitted_at
    ) order by c.updated_at desc), '[]'::jsonb)
  from public.admin_cases c
  left join lateral (
    select r.* from public.admin_verification_requests r
    where r.case_id = c.id and r.status in ('open', 'answered')
    order by r.created_at desc
    limit 1
  ) request on true
  where c.queue = 'verification'
    and (c.status = 'waiting_information' or (c.status = 'reopened' and request.id is not null))
    and auth.uid() is not null
    and auth.uid() in (
      c.subject_user_id,
      c.reporter_user_id,
      nullif(c.metadata #>> '{source,owner_user_id}', '')::uuid,
      nullif(c.metadata #>> '{source,operator_user_id}', '')::uuid,
      nullif(c.metadata #>> '{source,user_id}', '')::uuid
    );
$$;

revoke all on function public.get_my_verification_requests() from public, anon;
grant execute on function public.get_my_verification_requests() to authenticated;

commit;

-- Public account-deletion and data-access requests submitted from the policy
-- center. The public browser never receives database credentials with write
-- access: the same-origin serverless endpoint validates and stores requests
-- with the service role. Every request creates a trackable admin support case.

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  request_type text not null check (request_type in ('account_deletion', 'data_access')),
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  account_email text,
  account_phone text,
  country text,
  details text not null default '',
  status text not null default 'new' check (status in ('new','triaged','in_review','waiting_information','actioned','resolved','closed','rejected')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed','not_required')),
  contact_hash text not null,
  ip_hash text not null,
  user_agent text not null default '',
  source text not null default 'public_policy_center',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (nullif(btrim(coalesce(account_email, '')), '') is not null or nullif(btrim(coalesce(account_phone, '')), '') is not null)
);

create index if not exists privacy_requests_contact_created_idx
  on public.privacy_requests (contact_hash, request_type, created_at desc);

create index if not exists privacy_requests_ip_created_idx
  on public.privacy_requests (ip_hash, created_at desc);

alter table public.privacy_requests enable row level security;
revoke all on table public.privacy_requests from public, anon, authenticated;

create or replace function public.create_privacy_request_admin_case()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_label text;
  resource_label text;
  case_title text;
begin
  request_label := case when new.request_type = 'account_deletion' then 'Account deletion request' else 'Data access request' end;
  resource_label := case when new.request_type = 'account_deletion' then 'public_account_deletion_request' else 'public_data_access_request' end;
  case_title := request_label || ': ' || new.full_name || ' (' || new.reference_code || ')';

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, sla_due_at, country_name, metadata
  ) values (
    'platform', 'support',
    case when new.request_type = 'account_deletion' then 'account_deletion_request' else 'privacy_request' end,
    resource_label, new.id, case_title,
    coalesce(nullif(new.details, ''), request_label || ' submitted from the public Policy Center.'),
    case when new.request_type = 'account_deletion' then 'high' else 'normal' end,
    now() + case when new.request_type = 'account_deletion' then interval '24 hours' else interval '3 days' end,
    new.country,
    jsonb_build_object(
      'source', jsonb_build_object(
        'id', new.id,
        'reference', new.reference_code,
        'request_type', new.request_type,
        'full_name', new.full_name,
        'account_email', coalesce(new.account_email, ''),
        'account_phone', coalesce(new.account_phone, ''),
        'country', coalesce(new.country, ''),
        'details', new.details,
        'verification_status', new.verification_status,
        'submission_source', new.source,
        'created_at', new.created_at
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists privacy_requests_create_admin_case on public.privacy_requests;
create trigger privacy_requests_create_admin_case
after insert on public.privacy_requests
for each row execute function public.create_privacy_request_admin_case();

create or replace function public.sync_privacy_request_case_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_status text;
begin
  if new.resource_type not in ('public_account_deletion_request', 'public_data_access_request') or new.resource_id is null then
    return new;
  end if;

  next_status := case
    when new.status in ('new', 'reopened') then 'new'
    when new.status in ('triaged', 'assigned') then 'triaged'
    when new.status in ('in_review', 'action_proposed', 'approval_required') then 'in_review'
    when new.status = 'waiting_information' then 'waiting_information'
    when new.status in ('actioned', 'appeal_window') then 'actioned'
    when new.status = 'resolved' then 'resolved'
    when new.status = 'closed' then 'closed'
    else 'in_review'
  end;

  update public.privacy_requests
  set status = next_status,
      updated_at = now(),
      resolved_at = case when next_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
  where id = new.resource_id;

  return new;
end;
$$;

drop trigger if exists admin_cases_sync_privacy_request_status on public.admin_cases;
create trigger admin_cases_sync_privacy_request_status
after update of status on public.admin_cases
for each row
when (old.status is distinct from new.status)
execute function public.sync_privacy_request_case_status();

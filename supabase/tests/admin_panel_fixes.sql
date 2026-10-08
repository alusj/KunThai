-- Run ONLY against the disposable admin_fixes_test database:
-- psql -h /tmp -p 55432 -U pgtest -d admin_fixes_test -v ON_ERROR_STOP=1 -f supabase/tests/admin_panel_fixes.sql
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'admin_fixes_test' then raise exception 'This fixture requires the disposable admin_fixes_test database.'; end if; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- ---------- Admin access stand-ins ----------
create table public.test_admins(user_id uuid primary key, permissions text[] not null default '{}', authority smallint not null default 2, roles text[] not null default '{}');
create function public.admin_has_permission(requested_permission text, requested_sector text default null, user_uuid uuid default auth.uid())
returns boolean language sql stable as $$ select exists(select 1 from public.test_admins where user_id = user_uuid and requested_permission = any(permissions)) $$;
create function public.admin_authority_level(requested_sector text default null, user_uuid uuid default auth.uid())
returns smallint language sql stable as $$ select coalesce((select authority from public.test_admins where user_id = user_uuid), 0)::smallint $$;
create function public.admin_has_role(role_keys text[], user_uuid uuid default auth.uid())
returns boolean language sql stable as $$ select exists(select 1 from public.test_admins where user_id = user_uuid and roles && role_keys) $$;
create function public.is_kunthai_admin(user_uuid uuid default auth.uid())
returns boolean language sql stable as $$ select exists(select 1 from public.test_admins where user_id = user_uuid) $$;
create function public.kunthai_can_review_transport() returns boolean language sql stable as $$
  select auth.uid() is null or public.admin_has_permission('transport.verify', 'transport') $$;

create table public.admin_roles(id uuid primary key default gen_random_uuid(), role_key text unique, name text default 'Role', rank int default 40);
create table public.admin_assignments(id uuid primary key default gen_random_uuid(), user_id uuid, role_id uuid references public.admin_roles,
  authority_level smallint default 2, status text default 'active', granted_by uuid, sector_scopes text[] default '{all}', region_scopes text[] default '{all}',
  expires_at timestamptz, created_at timestamptz default now(), unique(user_id, role_id));
create table public.admin_staff_levels(level_key text primary key, rank int, max_authority smallint);
insert into public.admin_staff_levels values ('associate', 1, 1), ('specialist', 2, 2), ('lead', 4, 3);
create table public.admin_staff_profiles(user_id uuid primary key, level_key text references public.admin_staff_levels, added_by uuid, updated_at timestamptz);
create table public.staff_profile_trigger_log(user_id uuid);
create function public.staff_profile_guard() returns trigger language plpgsql as $$ begin insert into public.staff_profile_trigger_log values (new.user_id); return new; end $$;
create trigger staff_profile_guard before update on public.admin_staff_profiles for each row execute function public.staff_profile_guard();

-- ---------- Cases ----------
create table public.admin_cases(
  id uuid primary key default gen_random_uuid(), sector text not null, queue text not null default 'verification', case_type text not null default 'x',
  resource_type text not null, resource_id uuid, title text not null default 'Case', description text not null default '',
  status text not null default 'new' check (status in ('new','triaged','assigned','in_review','waiting_information','action_proposed','approval_required','actioned','appeal_window','resolved','closed','reopened')),
  priority text not null default 'normal', subject_user_id uuid, reporter_user_id uuid, assignee_user_id uuid, assigned_at timestamptz,
  sla_due_at timestamptz, resolution_code text, resolution_note text, metadata jsonb not null default '{}', country_iso text, country_name text,
  created_at timestamptz default now(), updated_at timestamptz default now(), resolved_at timestamptz, closed_at timestamptz,
  unique(resource_type, resource_id));
-- Production has notification triggers on cases; the backfills must not fire them.
create table public.case_trigger_log(case_id uuid);
create function public.case_trigger() returns trigger language plpgsql as $$ begin insert into public.case_trigger_log values (new.id); return new; end $$;
create trigger case_trigger after update on public.admin_cases for each row execute function public.case_trigger();
create table public.admin_case_events(id uuid primary key default gen_random_uuid(), case_id uuid, actor_user_id uuid, event_type text, from_status text, to_status text, summary text, metadata jsonb, created_at timestamptz default clock_timestamp());
create table public.admin_approvals(id uuid primary key default gen_random_uuid(), case_id uuid, action_type text, requested_by uuid, request_note text, payload jsonb, status text default 'pending');
create table public.admin_audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid, action_key text, sector text, resource_type text, resource_id uuid,
  case_id uuid, reason text, before_state jsonb, after_state jsonb, metadata jsonb, created_at timestamptz default clock_timestamp());
create function public.admin_log_action(action_key text, sector_key text default null, resource_kind text default null, resource_uuid uuid default null,
  case_uuid uuid default null, action_reason text default '', previous_state jsonb default null, next_state jsonb default null, action_metadata jsonb default '{}')
returns uuid language sql as $$
  insert into public.admin_audit_logs(actor_user_id, action_key, sector, resource_type, resource_id, case_id, reason, before_state, after_state, metadata)
  values (auth.uid(), action_key, sector_key, resource_kind, resource_uuid, case_uuid, coalesce(action_reason, ''), previous_state, next_state, coalesce(action_metadata, '{}')) returning id $$;
create table public.platform_account_controls(user_id uuid primary key, status text, reason text, restricted_sectors text[], expires_at timestamptz, updated_by uuid, updated_at timestamptz);
create table public.platform_notifications(id uuid primary key default gen_random_uuid(), user_id uuid, sector text, notification_type text, title text, body text, priority text);

-- ---------- Enforcement stand-ins ----------
create table public.admin_enforcement_states(target_type text, target_id uuid, status text, primary key (target_type, target_id));
create function public.admin_enforcement_permission_prefix(p_target_type text) returns text language sql immutable as $$
  select case p_target_type when 'marketplace_business' then 'marketplace.businesses' when 'transport_operator' then 'transport.operators' when 'transport_company' then 'transport.companies' end $$;
create function public.kunthai_enforcement_status(p_target_type text, p_target_id uuid) returns text language sql stable as $$
  select coalesce((select status from public.admin_enforcement_states where target_type = p_target_type and target_id = p_target_id), 'active') $$;
create function public.admin_apply_enforcement(p_target_type text, p_target_id uuid, p_action text, p_reason_code text, p_public_message text,
  p_internal_note text default '', p_capabilities text[] default '{}', p_ends_at timestamptz default null) returns jsonb language plpgsql as $$
begin
  if p_action = 'restoration' then delete from public.admin_enforcement_states where target_type = p_target_type and target_id = p_target_id;
  else insert into public.admin_enforcement_states values (p_target_type, p_target_id, 'suspended') on conflict do nothing; end if;
  return '{}'::jsonb;
end $$;

-- ---------- Source tables ----------
create type public.transport_verification_status as enum ('verified','not_verified','verification_pending');
create table public.transport_operators(id uuid primary key default gen_random_uuid(), user_id uuid, full_name text default 'Op', display_code text default 'KT-1', city text,
  account_status text default 'pending_review', verification_status public.transport_verification_status default 'verification_pending',
  verification_note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
create table public.transport_companies(id uuid primary key default gen_random_uuid(), owner_user_id uuid, company_name text default 'Co', company_code text, company_type text,
  country text, city text, verification_status text default 'pending', account_status text default 'submitted', admin_note text, rejection_reason text,
  reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
create table public.transport_company_fleets(id uuid primary key default gen_random_uuid(), company_id uuid, verification_status text default 'pending_review',
  active_status text default 'active', service_category text default 'Ride', updated_at timestamptz);
create table public.transport_fleets(id uuid primary key default gen_random_uuid(), operator_id uuid, company_fleet_id uuid, fleet_name text default 'Car',
  verification_status public.transport_verification_status default 'verification_pending', current_location_name text, service_category text default 'transport',
  completed_jobs integer default 0, updated_at timestamptz);
create table public.transport_company_members(id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid, operator_id uuid, role text, status text default 'active');
create table public.kunthai_business_subscriptions(id uuid primary key default gen_random_uuid(), surface text, plan_code text, status text,
  current_period_end timestamptz, auto_renew boolean, marketplace_business_id uuid, transport_company_id uuid);
create table public.transport_company_rentals(id uuid primary key default gen_random_uuid(), company_id uuid);
create table public.transport_rental_reservations(id uuid primary key default gen_random_uuid(), rental_id uuid);
create table public.marketplace_products(id uuid primary key default gen_random_uuid(), business_id uuid);
create table public.marketplace_business_admins(business_id uuid, user_id uuid, status text);
create table public.kunthai_business_plans(surface text, plan_code text, display_name text, vehicle_limit int, operator_limit int, admin_limit int, product_limit int);
create table public.transport_operator_documents(id uuid primary key default gen_random_uuid(), operator_id uuid, status public.transport_verification_status default 'verification_pending',
  admin_note text, reviewed_by uuid, reviewed_at timestamptz, uploaded_at timestamptz default now());
create table public.marketplace_businesses(id uuid primary key default gen_random_uuid(), user_id uuid, business_name text default 'Shop', business_kind text, business_type text,
  country text, city text, country_iso text, verification_status text default 'pending', created_at timestamptz default now(), updated_at timestamptz);
create table public.marketplace_seller_verification_requests(id uuid primary key default gen_random_uuid(), business_id uuid, status text default 'pending',
  reviewed_by uuid, reviewed_at timestamptz, updated_at timestamptz);
create table public.marketplace_business_documents(id uuid primary key default gen_random_uuid(), business_id uuid, document_type text default 'id', created_at timestamptz default now());
create table public.explore_posts(id uuid primary key default gen_random_uuid(), user_id uuid, moderation_status text default 'approved');
create table public.explore_post_reports(id uuid primary key default gen_random_uuid(), post_id uuid references public.explore_posts on delete cascade, status text default 'open');
create table public.explore_post_comments(id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.explore_comment_reports(id uuid primary key default gen_random_uuid(), comment_id uuid references public.explore_post_comments on delete cascade, status text default 'open');
create table public.explore_profile_reports(id uuid primary key default gen_random_uuid(), reported_user_id uuid, status text default 'open');

-- Intake exactly as production wires it before this migration.
create function public.admin_upsert_source_case(source_row jsonb, source_resource_type text, source_sector text, source_queue text, source_case_type text)
returns uuid language plpgsql as $$
declare v uuid; begin
  insert into public.admin_cases(sector, resource_type, resource_id, metadata) values (source_sector, source_resource_type, (source_row->>'id')::uuid, jsonb_build_object('source', source_row))
  on conflict (resource_type, resource_id) do update set metadata = excluded.metadata returning id into v; return v; end $$;
create function public.admin_capture_source_case() returns trigger language plpgsql as $$
begin perform public.admin_upsert_source_case(to_jsonb(new), tg_argv[0], tg_argv[1], tg_argv[2], tg_argv[3]); return new; end $$;
create trigger admin_intake_transport_operators after insert or update on public.transport_operators for each row execute function public.admin_capture_source_case('transport_operator_verification','transport','verification','operator_verification');
create trigger admin_intake_transport_companies after insert or update on public.transport_companies for each row execute function public.admin_capture_source_case('transport_company_verification','transport','verification','company_verification');
create trigger admin_intake_transport_fleets after insert or update on public.transport_company_fleets for each row execute function public.admin_capture_source_case('transport_fleet_verification','transport','verification','fleet_verification');
create trigger admin_intake_transport_solo_fleets after insert or update on public.transport_fleets for each row execute function public.admin_capture_source_case('transport_solo_fleet_verification','transport','verification','fleet_verification');
create trigger admin_intake_marketplace_businesses after insert or update on public.marketplace_businesses for each row execute function public.admin_capture_source_case('marketplace_business_registration','marketplace','verification','seller_registration');
create trigger admin_intake_marketplace_verification after insert or update on public.marketplace_seller_verification_requests for each row execute function public.admin_capture_source_case('marketplace_verification','marketplace','verification','seller_verification');
create trigger admin_intake_marketplace_business_documents after insert or update on public.marketplace_business_documents for each row execute function public.admin_capture_source_case('marketplace_business_document','marketplace','verification','seller_document');
create trigger admin_intake_explore_post_reports after insert or update on public.explore_post_reports for each row execute function public.admin_capture_source_case('explore_post_report','explore','reports','content_report');
create function public.admin_refresh_registration_evidence() returns trigger language plpgsql as $$
begin
  update public.admin_cases set metadata = jsonb_set(metadata, '{source,registration_documents}',
    (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at), '[]') from public.marketplace_business_documents d where d.business_id = new.business_id), true)
  where resource_type = 'marketplace_business_registration' and resource_id = new.business_id;
  return new;
end $$;
create trigger admin_refresh_marketplace_registration_evidence after insert or update on public.marketplace_business_documents for each row execute function public.admin_refresh_registration_evidence();

-- ---------- Campaigns ----------
create table public.admin_notification_campaigns(id uuid primary key default gen_random_uuid(), sector text default 'platform', status text default 'draft',
  channels text[] default array['in_app'], published_at timestamptz, sent_at timestamptz, updated_at timestamptz default now(), audience_type text default 'specific_users', audience_filter jsonb default '{}');
create trigger campaign_trigger before update on public.admin_notification_campaigns for each row execute function public.staff_profile_guard();
create function public.admin_publish_campaign_rows(campaign_uuid uuid) returns public.admin_notification_campaigns language sql as $$
  update public.admin_notification_campaigns set status = 'completed', published_at = now() where id = campaign_uuid returning * $$;
create function public.admin_estimate_campaign_audience(s text, t text, f jsonb) returns integer language sql as $$ select 1 $$;
-- campaign_trigger reuses the logging trigger; give it a harmless target.
create or replace function public.staff_profile_guard() returns trigger language plpgsql as $$
begin if tg_table_name = 'admin_staff_profiles' then insert into public.staff_profile_trigger_log values (new.user_id); end if; return new; end $$;

-- ---------- Workspace stand-ins ----------
create function public.admin_get_user_workspace(u uuid) returns jsonb language sql as $$ select jsonb_build_object('user', jsonb_build_object('id', u), 'summary', '{}'::jsonb) $$;
create function public.kunthai_public_user_id_from_uuid(u uuid) returns text language sql as $$ select 'KTU-' || left(u::text, 4) $$;

-- ---------- Join KunThai ----------
create table public.join_applications(id uuid primary key default gen_random_uuid(), priority text default 'normal', reviewer_score numeric, score_breakdown jsonb default '{}', last_activity_at timestamptz);
create table public.join_admin_notes(id uuid primary key default gen_random_uuid(), application_id uuid, author_id uuid, body text);
create table public.join_reviews(id uuid primary key default gen_random_uuid(), application_id uuid, reviewer_id uuid, rating smallint);

-- ---------- People ----------
-- 01 support-ish admin (cases.manage only, authority 3), 02 verification officer (authority 2),
-- 03 reports officer (authority 2), 04 super admin, 10 operator owner, 11 company owner, 12 seller
insert into auth.users select ('00000000-0000-4000-8000-0000000000' || n)::uuid from unnest(array['01','02','03','04','10','11','12']) n;
insert into public.test_admins values
  ('00000000-0000-4000-8000-000000000001', array['cases.view','cases.manage'], 3, '{}'),
  ('00000000-0000-4000-8000-000000000002', array['cases.view','cases.manage','transport.verify','marketplace.verify','users.view','transport.view'], 2, array['verification_officer']),
  ('00000000-0000-4000-8000-000000000003', array['cases.view','cases.manage','reports.manage'], 2, array['reports_officer']),
  ('00000000-0000-4000-8000-000000000004', array['cases.view','cases.manage','transport.verify','marketplace.verify','transport.companies.suspend','notifications.publish','join.manage'], 5, array['super_admin']);
insert into public.admin_roles(role_key) values ('verification_officer'), ('reports_officer');
insert into public.admin_assignments(user_id, role_id, authority_level)
select '00000000-0000-4000-8000-000000000002', id, 2 from public.admin_roles where role_key = 'verification_officer';
insert into public.admin_staff_profiles values ('00000000-0000-4000-8000-000000000002', 'associate');

-- ---------- Legacy rows the backfills must handle ----------
insert into public.transport_companies(id, owner_user_id) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011');
insert into public.transport_company_fleets(id, company_id) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
insert into public.transport_fleets(id, company_fleet_id) values ('60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');
insert into public.marketplace_businesses(id, user_id) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012');
insert into public.marketplace_business_documents(id, business_id) values ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001');
insert into public.admin_notification_campaigns(id, status, channels, published_at) values
  ('70000000-0000-4000-8000-000000000001', 'completed', array['push'], now() - interval '3 days'),
  ('70000000-0000-4000-8000-000000000002', 'completed', array['push','in_app'], now() - interval '1 hour');
delete from public.case_trigger_log;

\ir ../migrations/20261008160000_admin_panel_fixes.sql
-- Re-runnable.
\ir ../migrations/20261008160000_admin_panel_fixes.sql

create trigger guard_transport_operator_admin_fields_trigger before update on public.transport_operators for each row execute function public.guard_transport_operator_admin_fields();
create trigger guard_transport_company_review_fields_trigger before insert or update on public.transport_companies for each row execute function public.guard_transport_company_review_fields();

create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'TEST FAILED: %', message; end if; end $$;
create function public.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function public.expect_error(statement text, fragment text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(fragment in sqlerrm) = 0 then raise exception 'TEST FAILED: % (got: %)', message, sqlerrm; end if;
    return;
  end;
  raise exception 'TEST FAILED: %', message;
end $$;
create function public.case_for(t text, r text) returns uuid language sql as $$ select id from public.admin_cases where resource_type = t and resource_id = r::uuid $$;

-- ---------- Backfills ----------
select test_assert(not exists (select 1 from public.case_trigger_log), 'backfills do not fire case triggers');
select test_assert((select status = 'closed' from public.admin_cases where resource_type = 'transport_solo_fleet_verification' and resource_id = '60000000-0000-4000-8000-000000000001'),
  'the duplicate solo case of a company runtime fleet is closed');
select test_assert((select status = 'closed' and resolution_code = 'merged_into_registration' from public.admin_cases where resource_type = 'marketplace_business_document'),
  'an open document case with a registration case is closed');
select test_assert((select level_key = 'specialist' from public.admin_staff_profiles where user_id = '00000000-0000-4000-8000-000000000002'),
  'a Verification Officer at authority 2 is no longer capped by an Associate profile');
select test_assert(not exists (select 1 from public.staff_profile_trigger_log), 'the staff profile backfill does not fire profile triggers');
select test_assert((select push_queued_at is not null from public.admin_notification_campaigns where id = '70000000-0000-4000-8000-000000000001'), 'old push campaigns are marked handled');
select test_assert((select push_queued_at is null from public.admin_notification_campaigns where id = '70000000-0000-4000-8000-000000000002'), 'a recent push campaign stays queued');

-- ---------- 13 / 4. Documents stay with the registration case ----------
insert into public.marketplace_business_documents(business_id) values ('50000000-0000-4000-8000-000000000001');
select test_assert((select count(*) = 1 from public.admin_cases where resource_type = 'marketplace_business_document'), 'a new document upload opens no case');
select test_assert((select jsonb_array_length(metadata -> 'source' -> 'registration_documents') = 2 from public.admin_cases where resource_type = 'marketplace_business_registration'),
  'the registration case carries both documents');
update public.marketplace_businesses set business_name = 'Renamed shop' where id = '50000000-0000-4000-8000-000000000001';
select test_assert((select jsonb_array_length(metadata -> 'source' -> 'registration_documents') = 2 and metadata -> 'source' ->> 'business_name' = 'Renamed shop'
  from public.admin_cases where resource_type = 'marketplace_business_registration'), 'an edit to the business keeps the documents evidence');

-- ---------- 5. Solo fleet intake ----------
insert into public.transport_fleets(id, company_fleet_id) values ('60000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001');
select test_assert(case_for('transport_solo_fleet_verification', '60000000-0000-4000-8000-000000000002') is null, 'a company runtime fleet opens no solo fleet case');
insert into public.transport_fleets(id, operator_id) values ('60000000-0000-4000-8000-000000000003', null);
select test_assert(case_for('transport_solo_fleet_verification', '60000000-0000-4000-8000-000000000003') is not null, 'a solo fleet opens a case');
update public.transport_fleets set current_location_name = 'Lumley' where id = '60000000-0000-4000-8000-000000000003';
select test_assert((select metadata -> 'source' ->> 'current_location_name' is null from public.admin_cases where id = case_for('transport_solo_fleet_verification', '60000000-0000-4000-8000-000000000003')),
  'a location ping does not re-sync the case');

-- ---------- 1 / 2. Verification decisions ----------
insert into public.transport_operators(id, user_id) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010');
select as_user('00000000-0000-4000-8000-000000000001');
select expect_error($$select public.admin_apply_case_decision(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), 'approve', 'Looks good')$$,
  'Only staff with UrRide verification permission', 'cases.manage alone cannot approve an operator');
select test_assert((select status = 'new' from public.admin_cases where id = case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')), 'the refused case stays open');
select test_assert((select not ((item ->> 'allowed')::boolean) from jsonb_array_elements(public.admin_case_decision_capabilities(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')) -> 'decisions') item where item ->> 'key' = 'approve'),
  'capabilities show approve as unavailable without verification permission');

select as_user('00000000-0000-4000-8000-000000000002');
select test_assert(public.admin_case_decision_capabilities(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')) -> 'allowed'
  = '["approve","reject","request_information","dismiss","resolve"]'::jsonb, 'a Verification Officer can approve/reject but not restrict, remove or suspend');
select public.admin_apply_case_decision(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), 'approve', 'Documents verified');
select test_assert((select verification_status = 'verified' and account_status = 'approved' from public.transport_operators where id = '10000000-0000-4000-8000-000000000001'),
  'a Verification Officer at authority 2 approves an operator');
select test_assert((select status = 'resolved' and resolution_code = 'approve' from public.admin_cases where id = case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')), 'the case is resolved');
select test_assert((select metadata -> 'targetBefore' = '{"account_status":"pending_review","verification_status":"verification_pending"}'::jsonb from public.admin_audit_logs where action_key = 'case.decision_applied' order by created_at desc limit 1),
  'the decision log keeps the record''s previous status');
select expect_error($$select public.admin_apply_case_decision(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), 'restrict', 'x')$$,
  'Restrict and Remove do not apply', 'restrict is refused on verification cases');

-- 9. Undo puts the operator back.
select public.admin_undo_case_action(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), null, 'Approved the wrong operator');
select test_assert((select verification_status = 'verification_pending' and account_status = 'pending_review' from public.transport_operators where id = '10000000-0000-4000-8000-000000000001'),
  'undoing an approval returns the operator to pending');
select test_assert((select status = 'new' and resolution_code is null from public.admin_cases where id = case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')), 'undo reopens the case');

-- A guard that silently keeps the old status makes the decision fail loudly.
insert into public.transport_company_fleets(id, company_id) values ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');
create function public.test_sticky_fleet() returns trigger language plpgsql as $$ begin new.verification_status := old.verification_status; return new; end $$;
create trigger test_sticky_fleet before update on public.transport_company_fleets for each row when (new.id = '30000000-0000-4000-8000-000000000002') execute function public.test_sticky_fleet();
select expect_error($$select public.admin_apply_case_decision(case_for('transport_fleet_verification', '30000000-0000-4000-8000-000000000002'), 'approve', 'ok')$$,
  'did not change the record', 'a reverted update is not recorded as a decision');
select test_assert((select status = 'new' from public.admin_cases where id = case_for('transport_fleet_verification', '30000000-0000-4000-8000-000000000002')), 'the reverted case stays open');

-- ---------- 6. Reject, resubmit, reopen ----------
select public.admin_apply_case_decision(case_for('transport_company_verification', '20000000-0000-4000-8000-000000000001'), 'reject', 'Blurry licence');
select test_assert((select verification_status = 'rejected' and account_status = 'rejected' and rejection_reason = 'Blurry licence' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'), 'company rejected');
select as_user('00000000-0000-4000-8000-000000000011');
update public.transport_companies set verification_status = 'verified', account_status = 'approved' where id = '20000000-0000-4000-8000-000000000001';
select test_assert((select account_status = 'rejected' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'), 'an owner still cannot approve their company');
update public.transport_companies set account_status = 'submitted', rejection_reason = null where id = '20000000-0000-4000-8000-000000000001';
select test_assert((select account_status = 'submitted' and verification_status = 'pending' and rejection_reason = 'Blurry licence' from public.transport_companies where id = '20000000-0000-4000-8000-000000000001'),
  'a rejected company can resubmit and keeps the admin''s notes');
select test_assert((select status = 'reopened' and resolution_code is null and resolved_at is null from public.admin_cases where id = case_for('transport_company_verification', '20000000-0000-4000-8000-000000000001')),
  'the resubmission reopens the case');

select as_user('00000000-0000-4000-8000-000000000002');
select public.admin_apply_case_decision(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), 'reject', 'Expired licence');
select as_user('00000000-0000-4000-8000-000000000010');
update public.transport_operators set account_status = 'submitted' where id = '10000000-0000-4000-8000-000000000001';
select test_assert((select account_status = 'submitted' and verification_status = 'verification_pending' and verification_note = 'Expired licence' from public.transport_operators where id = '10000000-0000-4000-8000-000000000001'),
  'a rejected operator can resubmit');
update public.transport_operators set account_status = 'approved', verification_status = 'verified' where id = '10000000-0000-4000-8000-000000000001';
select test_assert((select account_status = 'submitted' from public.transport_operators where id = '10000000-0000-4000-8000-000000000001'), 'an operator cannot approve themselves');
select test_assert((select status = 'reopened' from public.admin_cases where id = case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001')), 'operator resubmission reopens the case');

-- ---------- 7. Suspend takes real effect ----------
select as_user('00000000-0000-4000-8000-000000000004');
select public.admin_apply_case_decision(case_for('transport_company_verification', '20000000-0000-4000-8000-000000000001'), 'suspend', 'Fraudulent registration papers');
select test_assert(public.kunthai_enforcement_status('transport_company', '20000000-0000-4000-8000-000000000001') = 'suspended', 'suspending a company case suspends the company');
select public.admin_undo_case_action(case_for('transport_company_verification', '20000000-0000-4000-8000-000000000001'), null, 'Wrong company');
select test_assert(public.kunthai_enforcement_status('transport_company', '20000000-0000-4000-8000-000000000001') = 'active', 'undoing the suspension restores the company');
select expect_error($$select public.admin_apply_case_decision(case_for('transport_solo_fleet_verification', '60000000-0000-4000-8000-000000000003'), 'suspend', 'x')$$,
  'Suspend does not apply', 'suspend is refused where it has no effect');

-- ---------- 8. Seller verification requests ----------
select as_user('00000000-0000-4000-8000-000000000002');
insert into public.marketplace_seller_verification_requests(id, business_id) values
  ('52000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001');
select public.admin_apply_case_decision(case_for('marketplace_verification', '52000000-0000-4000-8000-000000000001'), 'dismiss', 'Duplicate request');
select test_assert((select status = 'dismissed' from public.marketplace_seller_verification_requests where id = '52000000-0000-4000-8000-000000000001'), 'a dismissed request is closed, not pending');
select public.admin_apply_case_decision(case_for('marketplace_verification', '52000000-0000-4000-8000-000000000002'), 'approve', 'Verified');
select test_assert((select verification_status = 'verified' from public.marketplace_businesses where id = '50000000-0000-4000-8000-000000000001'), 'approving the request verifies the business');
select public.admin_undo_case_action(case_for('marketplace_verification', '52000000-0000-4000-8000-000000000002'), null, 'Too early');
select test_assert((select r.status = 'pending' and b.verification_status = 'pending' from public.marketplace_seller_verification_requests r join public.marketplace_businesses b on b.id = r.business_id
  where r.id = '52000000-0000-4000-8000-000000000002'), 'undo returns the request and the business to pending');
select expect_error($$select public.admin_apply_case_decision(case_for('marketplace_business_document', '51000000-0000-4000-8000-000000000001'), 'approve', 'x')$$,
  'decided in the business registration case', 'documents without a status column are refused');

-- ---------- 2 / 7. Reports Officers restrict and remove ----------
insert into public.explore_posts(id, user_id) values ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010');
insert into public.explore_post_reports(id, post_id) values ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001');
select as_user('00000000-0000-4000-8000-000000000003');
select public.admin_apply_case_decision(case_for('explore_post_report', '81000000-0000-4000-8000-000000000001'), 'restrict', 'Graphic content');
select test_assert((select moderation_status = 'blocked' from public.explore_posts where id = '80000000-0000-4000-8000-000000000001'), 'a Reports Officer at authority 2 restricts a post');
update public.admin_cases set status = 'in_review', resolution_code = null where id = case_for('explore_post_report', '81000000-0000-4000-8000-000000000001');
select public.admin_apply_case_decision(case_for('explore_post_report', '81000000-0000-4000-8000-000000000001'), 'remove', 'Graphic content');
select test_assert((select status = 'approval_required' from public.admin_cases where id = case_for('explore_post_report', '81000000-0000-4000-8000-000000000001')), 'remove still needs chief approval');
select test_assert((select ((item ->> 'needsApproval')::boolean and (item ->> 'allowed')::boolean) from jsonb_array_elements(public.admin_case_decision_capabilities(case_for('explore_post_report', '81000000-0000-4000-8000-000000000001')) -> 'decisions') item where item ->> 'key' = 'remove'),
  'capabilities show remove as allowed with approval');
insert into public.admin_cases(sector, resource_type, resource_id) values ('explore', 'explore_comment_report', gen_random_uuid()), ('explore', 'explore_profile_report', gen_random_uuid()), ('explore', 'user_care_feedback', gen_random_uuid());
select expect_error($$select public.admin_apply_case_decision((select id from public.admin_cases where resource_type = 'explore_comment_report'), 'restrict', 'x')$$, 'cannot be restricted', 'comment restrict refused');
select expect_error($$select public.admin_apply_case_decision((select id from public.admin_cases where resource_type = 'explore_profile_report'), 'restrict', 'x')$$, 'account controls', 'profile restrict refused');
select expect_error($$select public.admin_apply_case_decision((select id from public.admin_cases where resource_type = 'user_care_feedback'), 'remove', 'x')$$, 'no effect', 'remove on feedback refused');
select expect_error($$select public.admin_apply_case_decision(case_for('transport_operator_verification', '10000000-0000-4000-8000-000000000001'), 'approve', 'x')$$,
  'Only staff with UrRide verification permission', 'a Reports Officer cannot approve operators');

-- ---------- 10. Campaign push queue ----------
select as_user('00000000-0000-4000-8000-000000000003');
select test_assert((select count(*) = 0 from public.admin_claim_campaign_push()), 'staff without publish permission claim nothing');
select as_user('00000000-0000-4000-8000-000000000004');
select test_assert((select array_agg(queued_campaign_id) = array['70000000-0000-4000-8000-000000000002'::uuid] from public.admin_claim_campaign_push()), 'a pending push campaign is claimed');
select test_assert((select count(*) = 0 from public.admin_claim_campaign_push()), 'it is claimed only once');
insert into public.admin_notification_campaigns(id, status, channels) values ('70000000-0000-4000-8000-000000000003', 'scheduled', array['push']);
-- pg_cron releases it (no signed-in admin).
select public.admin_publish_campaign_rows('70000000-0000-4000-8000-000000000003');
select as_user('');
select test_assert((select array_agg(queued_campaign_id) = array['70000000-0000-4000-8000-000000000003'::uuid] from public.admin_claim_campaign_push()), 'the scheduled job (service role) claims a pg_cron release');
select as_user('00000000-0000-4000-8000-000000000004');
insert into public.admin_notification_campaigns(id, status, channels) values ('70000000-0000-4000-8000-000000000004', 'approved', array['push']);
select public.admin_publish_campaign('70000000-0000-4000-8000-000000000004');
select test_assert((select push_queued_at is not null from public.admin_notification_campaigns where id = '70000000-0000-4000-8000-000000000004'), 'a console publish is marked queued (the console sends it)');

-- ---------- 17. Archived fleets are not counted ----------
update public.transport_company_fleets set archived_at = now() where id = '30000000-0000-4000-8000-000000000002';
select as_user('00000000-0000-4000-8000-000000000002');
select test_assert((select (public.admin_get_user_workspace_v2('00000000-0000-4000-8000-000000000011') -> 'companies' -> 0 ->> 'fleet_count')::int = 1), 'archived company fleets are not counted');

-- ---------- 18. Join KunThai audit ----------
insert into public.join_applications(id) values ('90000000-0000-4000-8000-000000000001');
select as_user('00000000-0000-4000-8000-000000000004');
select public.join_admin_set_priority('90000000-0000-4000-8000-000000000001', 'high');
select public.join_admin_score_application('90000000-0000-4000-8000-000000000001', 80, '{"vision":4}');
insert into public.join_admin_notes(application_id, author_id, body) values ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'Strong');
insert into public.join_reviews(application_id, reviewer_id, rating) values ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 4);
update public.join_reviews set rating = 5;
select test_assert((select array_agg(action_key order by created_at) = array['join.priority_changed','join.score_changed','join.note_added','join.review_added','join.review_updated']
  from public.admin_audit_logs where resource_id = '90000000-0000-4000-8000-000000000001'), 'priority, score, notes and reviews are audited');
select test_assert((select before_state ->> 'priority' = 'normal' and after_state ->> 'priority' = 'high' from public.admin_audit_logs where action_key = 'join.priority_changed'), 'priority change keeps before/after');

select 'admin panel fixes: all assertions passed' as result;

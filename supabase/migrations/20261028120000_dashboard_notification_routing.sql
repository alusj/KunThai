-- Seller, operator and company notices reach their dashboards (2026-10-28).
--
-- The UrMall seller dashboard lists platform_notifications rows with
-- workspace 'marketplace_seller', the UrRide operator dashboard
-- 'transport_operator', and Fleet HQ 'transport_company' (workspace_id = the
-- company). Only seller and operator verification decisions and company
-- rental updates were tagged; everything else about a business landed in the
-- person's general notifications only, or (company verification, admin
-- notices to an owner, plan notices) nowhere a dashboard looks.
--
--  1. route_platform_notification_to_dashboard (before insert) tags:
--       - notices about an admin case (admin-case:<id>) for a seller,
--         operator, company or fleet verification, including company and
--         company-fleet decisions (workspace_id = the company);
--       - plan notices (business_subscription): UrMall business → seller,
--         UrRide company → company, otherwise operator;
--       - any notice that opens a seller, operator or company dashboard
--         (urmall:business*, urride:operator-dashboard,
--         urride:company-dashboard[:id]): enforcement notices, admin
--         messages, admin-role responses for the business owner.
--     Same rules as src/Backend/services/notificationDashboardRouting.js.
--  2. admin_send_owner_notification (case drawer → Notify owner) tags the
--     notice for the target's dashboard whatever screen its button opens.
--  3. Credit notices (purchase confirmed, credits added by KunThai) stay in
--     the person's own notifications, since credits are one balance, and are
--     copied into each dashboard they run: their UrMall business, their
--     operator account, each company they own. Copies are in-app only (one
--     push per notice) and carry display_config.dashboardCopyOf. Space
--     purchases are not copied: those credits belong to the Space.
--  4. When an applicant answers a request for more information (a document
--     upload reopens the case), they are told KunThai received it; the notice
--     goes to their dashboard by rule 1.
--  5. Pushes for operator and company notices open that dashboard.
--  6. Rows already delivered are moved / copied the same way.
--
-- Builds on 20261015090000_approve_and_recommend_decisions.sql,
-- 20261014100000_urride_rental_notifications_to_company_inbox.sql and
-- 20261014170000_platform_notifications_always_push.sql. Safe to run more
-- than once.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The company a company notice belongs to when it names none: the one the
-- recipient owns (most recent), else one they are an active admin of.
create or replace function public.dashboard_notification_company_for(p_user_id uuid, p_hint uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select company.id from public.transport_companies company
      where company.id = p_hint
        and (company.owner_user_id = p_user_id
          or exists (select 1 from public.transport_company_members member
                     where member.company_id = company.id and member.user_id = p_user_id
                       and member.role = 'admin' and member.status = 'active'))),
    (select company.id from public.transport_companies company
      where company.owner_user_id = p_user_id
      order by company.created_at desc limit 1),
    (select member.company_id from public.transport_company_members member
      where member.user_id = p_user_id and member.role = 'admin' and member.status = 'active'
      order by member.created_at desc limit 1)
  );
$$;

-- Dashboard for a verification case: (workspace, company id).
create or replace function public.dashboard_notification_case_route(p_case_id uuid)
returns table (workspace text, company_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when admin_case.resource_type in ('marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document')
        then 'marketplace_seller'
      when admin_case.resource_type in ('transport_operator_verification', 'transport_document_verification', 'transport_solo_fleet_verification')
        then 'transport_operator'
      when admin_case.resource_type in ('transport_company_verification', 'transport_fleet_verification')
        then 'transport_company'
    end,
    case
      when admin_case.resource_type = 'transport_company_verification' then admin_case.resource_id
      when admin_case.resource_type = 'transport_fleet_verification'
        then (select fleet.company_id from public.transport_company_fleets fleet where fleet.id = admin_case.resource_id)
    end
  from public.admin_cases admin_case
  where admin_case.id = p_case_id;
$$;

revoke all on function public.dashboard_notification_company_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dashboard_notification_case_route(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Route new notices
-- ---------------------------------------------------------------------------

create or replace function public.route_platform_notification_to_dashboard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target text := btrim(coalesce(new.action_target, ''));
  v_type text := coalesce(new.notification_type, '');
  v_workspace text;
  v_company uuid;
  v_case uuid;
begin
  if new.campaign_id is not null or new.user_id is null
     or lower(coalesce(new.workspace, '')) in ('marketplace_seller', 'transport_operator', 'transport_company')
     or v_type in ('visibility_credit_purchase', 'visibility_credit_grant') then
    return new;
  end if;

  if v_target like 'admin-case:%' then
    v_case := public.explore_try_uuid(substr(v_target, length('admin-case:') + 1));
    if v_case is null then return new; end if;
    select route.workspace, route.company_id into v_workspace, v_company
    from public.dashboard_notification_case_route(v_case) route;
    if v_workspace is null or (v_workspace = 'transport_company' and v_company is null) then
      return new;
    end if;
    -- The apps have no screen for an admin case; dashboard notices need no link.
    new.action_target := null;
  elsif v_type = 'business_subscription' then
    if new.sector = 'marketplace' then
      v_workspace := 'marketplace_seller';
    elsif new.sector = 'transport' then
      v_workspace := case when new.workspace_id is not null then 'transport_company' else 'transport_operator' end;
      v_company := new.workspace_id;
    end if;
  elsif v_target = 'urmall:business' or v_target like 'urmall:business-%' then
    v_workspace := 'marketplace_seller';
  elsif v_target = 'urride:operator-dashboard' then
    v_workspace := 'transport_operator';
  elsif v_target = 'urride:company-dashboard' or v_target like 'urride:company-dashboard:%' then
    v_workspace := 'transport_company';
    v_company := public.dashboard_notification_company_for(
      new.user_id,
      coalesce(public.explore_try_uuid(substr(v_target, length('urride:company-dashboard:') + 1)), new.workspace_id));
    if v_company is null then return new; end if;
  end if;

  if v_workspace is null then return new; end if;
  new.workspace := v_workspace;
  new.sector := case when v_workspace = 'marketplace_seller' then 'marketplace' else 'transport' end;
  if v_workspace = 'transport_company' then new.workspace_id := v_company; end if;
  return new;
end;
$$;

revoke all on function public.route_platform_notification_to_dashboard() from public;

drop trigger if exists route_platform_notification_to_dashboard on public.platform_notifications;
create trigger route_platform_notification_to_dashboard
before insert on public.platform_notifications
for each row execute function public.route_platform_notification_to_dashboard();

-- ---------------------------------------------------------------------------
-- 2. Admin notices to an owner go to the owner's dashboard
-- Latest definition before this: 20261001150000_admin_operations_platform.sql
-- ---------------------------------------------------------------------------

create or replace function public.admin_send_owner_notification(
  p_target_type text,
  p_target_id uuid,
  p_title text,
  p_body text,
  p_action_target text default null,
  p_priority text default 'normal'
)
returns public.admin_direct_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := public.admin_enforcement_permission_prefix(p_target_type);
  v_sector text := public.admin_enforcement_sector(p_target_type);
  v_workspace text := case p_target_type
    when 'marketplace_business' then 'marketplace_seller'
    when 'transport_operator' then 'transport_operator'
    when 'transport_company' then 'transport_company'
  end;
  v_owner uuid;
  v_label text;
  v_notification_id uuid;
  v_log public.admin_direct_notifications;
begin
  if v_prefix is null then raise exception 'Unknown target type'; end if;
  if not public.admin_has_permission('notifications.direct')
    or not public.admin_has_permission(v_prefix || '.view', v_sector) then
    raise exception 'Not authorized';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'The title must be 3 to 120 characters'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 10 and 2000 then raise exception 'The message must be 10 to 2000 characters'; end if;
  if coalesce(p_priority, 'normal') not in ('normal', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if p_action_target is not null and p_action_target !~ '^[a-z0-9:_-]{1,80}$' then raise exception 'Invalid destination'; end if;

  select target.owner_user_id, target.label into v_owner, v_label
  from public.admin_enforcement_target(p_target_type, p_target_id) target;
  if v_owner is null then raise exception 'That record no longer exists'; end if;

  insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target, workspace, workspace_id)
  values (v_owner, v_sector, 'admin_message', btrim(p_title), btrim(p_body), coalesce(p_priority, 'normal'),
          nullif(btrim(coalesce(p_action_target, '')), ''), v_workspace,
          case when p_target_type = 'transport_company' then p_target_id end)
  returning id into v_notification_id;

  insert into public.admin_direct_notifications (target_type, target_id, recipient_user_id, title, body, action_target, priority, notification_id, sent_by)
  values (p_target_type, p_target_id, v_owner, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_action_target, '')), ''), coalesce(p_priority, 'normal'), v_notification_id, auth.uid())
  returning * into v_log;

  perform public.admin_log_action('notification.direct_sent', v_sector, p_target_type, p_target_id, null, btrim(p_title), null, null,
    jsonb_build_object('notificationId', v_notification_id, 'recipient', v_owner, 'label', v_label));
  return v_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Credit notices are copied into each dashboard
-- ---------------------------------------------------------------------------

create or replace function public.copy_credit_notification_to_dashboards(p_notice public.platform_notifications)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_space boolean := false;
  v_purchase uuid;
begin
  if p_notice.campaign_id is not null or p_notice.user_id is null
     or coalesce(p_notice.notification_type, '') not in ('visibility_credit_purchase', 'visibility_credit_grant')
     or coalesce(p_notice.display_config, '{}'::jsonb) ? 'dashboardCopyOf'
     or lower(coalesce(p_notice.workspace, '')) in ('marketplace_seller', 'transport_operator', 'transport_company') then
    return 0;
  end if;

  -- Credits bought for an Explore Space are the Space's, not the person's.
  if coalesce(p_notice.action_target, '') like 'visibility-credit-purchase:%' then
    v_purchase := public.explore_try_uuid(substr(p_notice.action_target, length('visibility-credit-purchase:') + 1));
    select purchase.space_id is not null into v_space
    from public.visibility_credit_purchases purchase where purchase.id = v_purchase;
    if coalesce(v_space, false) then return 0; end if;
  end if;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status, category,
    workspace, workspace_id, action_target, action_data, channels, presentation,
    dedupe_key, display_config, created_at, expires_at
  )
  select p_notice.user_id, dashboard.sector, p_notice.notification_type, p_notice.title, p_notice.body,
         p_notice.priority, p_notice.status, p_notice.category,
         dashboard.workspace, dashboard.workspace_id,
         -- The purchase link opens the Explore wallet; dashboards need none.
         null, coalesce(p_notice.action_data, '{}'::jsonb), array['in_app']::text[], 'inbox',
         'dashboard-copy:' || p_notice.id::text || ':' || dashboard.workspace || ':' || coalesce(dashboard.workspace_id::text, ''),
         coalesce(p_notice.display_config, '{}'::jsonb) || jsonb_build_object('dashboardCopyOf', p_notice.id),
         p_notice.created_at, p_notice.expires_at
  from (
    select 'marketplace_seller'::text as workspace, 'marketplace'::text as sector, null::uuid as workspace_id
    where exists (select 1 from public.marketplace_businesses business where business.user_id = p_notice.user_id)
    union all
    select 'transport_operator', 'transport', null
    where exists (select 1 from public.transport_operators operator where operator.user_id = p_notice.user_id)
    union all
    select 'transport_company', 'transport', company.id
    from public.transport_companies company
    where company.owner_user_id = p_notice.user_id
  ) dashboard
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.copy_credit_notification_to_dashboards(public.platform_notifications) from public, anon, authenticated;

create or replace function public.copy_credit_notification_to_dashboards_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.copy_credit_notification_to_dashboards(new);
  exception when others then
    -- A dashboard copy must never cost the person their own notice.
    raise warning 'copy_credit_notification_to_dashboards skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.copy_credit_notification_to_dashboards_trigger() from public;

drop trigger if exists copy_credit_notification_to_dashboards on public.platform_notifications;
create trigger copy_credit_notification_to_dashboards
after insert on public.platform_notifications
for each row execute function public.copy_credit_notification_to_dashboards_trigger();

-- Copies never push: the person's own notice already did.
-- Latest definition before this: 20261014170000_platform_notifications_always_push.sql
create or replace function public.platform_notifications_add_push_channel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_id is not null
     or coalesce(new.display_config, '{}'::jsonb) ? 'dashboardCopyOf'
     or 'push' = any(coalesce(new.channels, array['in_app']::text[])) then
    return new;
  end if;
  if coalesce(new.notification_type, '') = 'admin_test' then
    -- A test pushes only when the campaign it tests would.
    if not exists (
      select 1 from public.admin_notification_campaigns campaign
      where campaign.id::text = coalesce(new.display_config ->> 'testCampaignId', '')
        and 'push' = any(coalesce(campaign.channels, array[]::text[]))
    ) then
      return new;
    end if;
  end if;
  new.channels := array_append(coalesce(new.channels, array['in_app']::text[]), 'push');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. "We received your update" when a verification case is resubmitted
-- ---------------------------------------------------------------------------

create or replace function public.notify_applicant_of_case_resubmission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  source jsonb := coalesce(new.metadata -> 'source', '{}'::jsonb);
begin
  -- Only the applicant answering a request (a document upload while the case
  -- waits on them) reopens it from waiting_information; an admin reopen does not.
  if new.queue <> 'verification' or new.status <> 'reopened' or old.status <> 'waiting_information' then
    return new;
  end if;
  v_user := coalesce(new.subject_user_id, new.reporter_user_id,
    public.explore_try_uuid(coalesce(source ->> 'operator_user_id', source ->> 'owner_user_id', source ->> 'user_id')));
  if v_user is null then return new; end if;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, action_target, dedupe_key
  ) values (
    v_user, coalesce(new.sector, 'platform'), 'verification_resubmitted',
    'Update received',
    'KunThai received your updated information and will review it again.',
    'normal',
    'admin-case:' || new.id::text,
    'verification-resubmitted:' || new.id::text || ':' || coalesce(new.review_round, 1)::text
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
exception when others then
  raise warning 'notify_applicant_of_case_resubmission skipped: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_applicant_of_case_resubmission() from public;

-- After admin_cases_track_review_timeline has bumped review_round.
drop trigger if exists notify_applicant_of_case_resubmission on public.admin_cases;
create trigger notify_applicant_of_case_resubmission
after update of status on public.admin_cases
for each row execute function public.notify_applicant_of_case_resubmission();

-- ---------------------------------------------------------------------------
-- 5. Pushes for operator and company notices open that dashboard
-- Latest definition before this: 20261015090000_approve_and_recommend_decisions.sql
-- ---------------------------------------------------------------------------

create or replace function public.push_queue_platform_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sector text := lower(coalesce(new.sector, new.workspace, ''));
  v_workspace text := lower(coalesce(new.workspace, ''));
  v_rental boolean := coalesce(new.action_target, '') like 'urride:rental:%';
  v_allowed boolean;
  v_route text;
begin
  begin
    if new.campaign_id is not null or new.user_id is null
       or not ('push' = any(coalesce(new.channels, '{}'::text[])))
       or (new.expires_at is not null and new.expires_at <= now()) then
      return new;
    end if;
    v_allowed := case
      when v_sector = 'transport' then public.push_transport_recipient_allows(new.user_id)
      when v_sector = 'marketplace' then public.push_recipient_allows(new.user_id, 'commerce', null, null, null)
      else public.push_recipient_allows(new.user_id, 'platform', null, null, null)
    end;
    if not v_allowed then
      return new;
    end if;
    v_route := case
      when v_workspace = 'marketplace_seller' then 'urmall:business'
      when v_workspace = 'transport_operator' and not v_rental then 'urride:operator-dashboard'
      when v_workspace = 'transport_company' and not v_rental and new.workspace_id is not null
        then 'urride:company-dashboard:' || new.workspace_id::text
      when v_sector = 'transport' then public.push_urride_rental_route(new.action_target, new.user_id)
      else public.push_campaign_route(v_sector)
    end;
    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    values (new.user_id,
            coalesce(nullif(public.push_short_text(new.title, 100), ''), 'KunThai'),
            public.push_short_text(new.body, 180),
            v_route,
            coalesce(nullif(new.notification_type, ''), 'activity'),
            'platform_notification:' || new.id::text)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_platform_notification skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Rows already delivered
-- guard_platform_notification_user_update keeps routing columns for
-- non-admin writers, so it is off for these updates only.
-- ---------------------------------------------------------------------------

alter table public.platform_notifications disable trigger guard_platform_notification_user_update_trigger;

-- Verification notices for companies and company fleets.
update public.platform_notifications notice
set workspace = 'transport_company',
    sector = 'transport',
    workspace_id = route.company_id,
    action_target = null
from public.admin_cases admin_case
cross join lateral public.dashboard_notification_case_route(admin_case.id) route
where notice.campaign_id is null
  and notice.action_target = 'admin-case:' || admin_case.id::text
  and route.workspace = 'transport_company'
  and route.company_id is not null
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

-- Seller and operator verification notices sent before 20261015090000.
update public.platform_notifications notice
set workspace = route.workspace,
    sector = case when route.workspace = 'marketplace_seller' then 'marketplace' else 'transport' end,
    action_target = null
from public.admin_cases admin_case
cross join lateral public.dashboard_notification_case_route(admin_case.id) route
where notice.campaign_id is null
  and notice.action_target = 'admin-case:' || admin_case.id::text
  and route.workspace in ('marketplace_seller', 'transport_operator')
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

-- Admin notices to an owner.
update public.platform_notifications notice
set workspace = case direct.target_type
      when 'marketplace_business' then 'marketplace_seller'
      when 'transport_operator' then 'transport_operator'
      else 'transport_company'
    end,
    workspace_id = case when direct.target_type = 'transport_company' then direct.target_id else notice.workspace_id end
from public.admin_direct_notifications direct
where direct.notification_id = notice.id
  and direct.target_type in ('marketplace_business', 'transport_operator', 'transport_company')
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

-- Plan notices.
update public.platform_notifications notice
set workspace = case
      when notice.sector = 'marketplace' then 'marketplace_seller'
      when notice.workspace_id is not null then 'transport_company'
      else 'transport_operator'
    end
where notice.campaign_id is null
  and notice.notification_type = 'business_subscription'
  and notice.sector in ('marketplace', 'transport')
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

-- Notices that open a seller or operator dashboard (enforcement, admin-role responses).
update public.platform_notifications notice
set workspace = case when notice.action_target like 'urmall:%' then 'marketplace_seller' else 'transport_operator' end,
    sector = case when notice.action_target like 'urmall:%' then 'marketplace' else 'transport' end
where notice.campaign_id is null
  and (notice.action_target = 'urmall:business' or notice.action_target like 'urmall:business-%'
       or notice.action_target = 'urride:operator-dashboard')
  and coalesce(notice.notification_type, '') not in ('visibility_credit_purchase', 'visibility_credit_grant')
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

-- Notices that open a company dashboard.
update public.platform_notifications notice
set workspace = 'transport_company',
    sector = 'transport',
    workspace_id = public.dashboard_notification_company_for(
      notice.user_id,
      coalesce(public.explore_try_uuid(substr(notice.action_target, length('urride:company-dashboard:') + 1)), notice.workspace_id))
where notice.campaign_id is null
  and (notice.action_target = 'urride:company-dashboard' or notice.action_target like 'urride:company-dashboard:%')
  and public.dashboard_notification_company_for(
        notice.user_id,
        coalesce(public.explore_try_uuid(substr(notice.action_target, length('urride:company-dashboard:') + 1)), notice.workspace_id)) is not null
  and notice.workspace not in ('marketplace_seller', 'transport_operator', 'transport_company');

alter table public.platform_notifications enable trigger guard_platform_notification_user_update_trigger;

-- Credit notices already delivered get their dashboard copies (in-app only).
select public.copy_credit_notification_to_dashboards(notice)
from public.platform_notifications notice
where notice.campaign_id is null
  and notice.notification_type in ('visibility_credit_purchase', 'visibility_credit_grant')
  and not (coalesce(notice.display_config, '{}'::jsonb) ? 'dashboardCopyOf');

commit;

-- Join KunThai workflow: derived summaries, applicant guards, review RPCs,
-- admin permissions, row level security, and the application document store.

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

create or replace function public.join_answer_text(p_application_id uuid, p_question_key text)
returns text
language sql
stable
set search_path = public
as $$
  -- Always a string: an unanswered question, a cleared answer, and a
  -- non-scalar answer all read as '' so the profile mirror stays NOT NULL.
  select coalesce((
    select case
      when answer.value is null then ''
      when jsonb_typeof(answer.value) in ('object','array','null') then ''
      else coalesce(answer.value #>> '{}', '')
    end
    from public.join_answers answer
    where answer.application_id = p_application_id
      and answer.question_key = p_question_key
  ), '');
$$;

create or replace function public.join_option_label(p_application_type text, p_question_key text, p_value text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select option.label
      from public.join_question_options option
      where option.application_type = p_application_type
        and option.question_key = p_question_key
        and option.value = p_value
      limit 1
    ),
    initcap(replace(coalesce(p_value, ''), '_', ' '))
  );
$$;

drop function if exists public.join_option_label(text, text);

create or replace function public.join_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists join_applications_set_updated_at on public.join_applications;
create trigger join_applications_set_updated_at
before update on public.join_applications
for each row execute function public.join_set_updated_at();

drop trigger if exists join_question_definitions_set_updated_at on public.join_question_definitions;
create trigger join_question_definitions_set_updated_at
before update on public.join_question_definitions
for each row execute function public.join_set_updated_at();

-- ---------------------------------------------------------------------------
-- Answers drive the queryable mirror, so the admin queue can sort and search
-- without unpacking jsonb on every row.
-- ---------------------------------------------------------------------------

create or replace function public.join_refresh_application_profile(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
  v_first text;
  v_middle text;
  v_last text;
  v_entity text;
  v_representative text;
  v_person_name text;
  v_headline text;
  v_display_name text;
  v_investor_type text;
  v_department text;
  v_volunteer_areas jsonb;
  v_volunteer_first text;
  v_volunteer_count integer;
  v_amount text;
  v_currency text;
begin
  select * into application from public.join_applications where id = p_application_id;
  if application.id is null then
    return;
  end if;

  v_first := public.join_answer_text(p_application_id, 'first_name');
  v_middle := public.join_answer_text(p_application_id, 'middle_name');
  v_last := public.join_answer_text(p_application_id, 'last_name');
  v_entity := public.join_answer_text(p_application_id, 'entity_name');
  v_representative := public.join_answer_text(p_application_id, 'representative_name');
  v_person_name := btrim(regexp_replace(concat_ws(' ', v_first, v_middle, v_last), '\s+', ' ', 'g'));

  insert into public.join_applicant_profiles (
    application_id, first_name, middle_name, last_name, email, phone, date_of_birth,
    nationality, country, city, occupation, employer, linkedin_url, github_url,
    portfolio_url, website_url, entity_name, entity_type, registration_country,
    registration_number, representative_name, representative_position,
    preferred_location, updated_at
  ) values (
    p_application_id,
    v_first,
    v_middle,
    v_last,
    public.join_answer_text(p_application_id, 'email'),
    public.join_answer_text(p_application_id, 'phone'),
    nullif(public.join_answer_text(p_application_id, 'date_of_birth'), '')::date,
    public.join_answer_text(p_application_id, 'nationality'),
    public.join_answer_text(p_application_id, 'country'),
    public.join_answer_text(p_application_id, 'city'),
    public.join_answer_text(p_application_id, 'occupation'),
    public.join_answer_text(p_application_id, 'employer'),
    public.join_answer_text(p_application_id, 'linkedin_url'),
    public.join_answer_text(p_application_id, 'github_url'),
    public.join_answer_text(p_application_id, 'portfolio_url'),
    public.join_answer_text(p_application_id, 'website_url'),
    v_entity,
    public.join_answer_text(p_application_id, 'entity_type'),
    public.join_answer_text(p_application_id, 'registration_country'),
    public.join_answer_text(p_application_id, 'registration_number'),
    v_representative,
    public.join_answer_text(p_application_id, 'representative_position'),
    public.join_answer_text(p_application_id, 'preferred_location'),
    now()
  )
  on conflict (application_id) do update
  set first_name = excluded.first_name,
      middle_name = excluded.middle_name,
      last_name = excluded.last_name,
      email = excluded.email,
      phone = excluded.phone,
      date_of_birth = excluded.date_of_birth,
      nationality = excluded.nationality,
      country = excluded.country,
      city = excluded.city,
      occupation = excluded.occupation,
      employer = excluded.employer,
      linkedin_url = excluded.linkedin_url,
      github_url = excluded.github_url,
      portfolio_url = excluded.portfolio_url,
      website_url = excluded.website_url,
      entity_name = excluded.entity_name,
      entity_type = excluded.entity_type,
      registration_country = excluded.registration_country,
      registration_number = excluded.registration_number,
      representative_name = excluded.representative_name,
      representative_position = excluded.representative_position,
      preferred_location = excluded.preferred_location,
      updated_at = now();

  v_display_name := coalesce(nullif(v_person_name, ''), nullif(v_representative, ''), nullif(v_entity, ''), '');

  if application.application_type = 'staff' then
    v_department := public.join_answer_text(p_application_id, 'department');
    v_headline := case
      when v_department = '' then 'Team application'
      else public.join_option_label('staff', 'department', v_department)
    end;
  elsif application.application_type = 'volunteer' then
    select answer.value into v_volunteer_areas
    from public.join_answers answer
    where answer.application_id = p_application_id and answer.question_key = 'volunteer_areas';

    if v_volunteer_areas is not null
       and jsonb_typeof(v_volunteer_areas) = 'array'
       and jsonb_array_length(v_volunteer_areas) > 0 then
      v_volunteer_count := jsonb_array_length(v_volunteer_areas);
      v_volunteer_first := public.join_option_label('volunteer', 'volunteer_areas', v_volunteer_areas ->> 0);
      v_headline := case
        when v_volunteer_count > 1 then v_volunteer_first || ' +' || (v_volunteer_count - 1)::text
        else v_volunteer_first
      end;
    else
      v_headline := 'Volunteer application';
    end if;
  else
    v_investor_type := public.join_answer_text(p_application_id, 'investor_type');
    v_currency := public.join_answer_text(p_application_id, 'investment_currency');
    v_amount := public.join_answer_text(p_application_id, 'investment_amount');
    v_headline := case
      when v_investor_type = '' then 'Investor application'
      else public.join_option_label('investor', 'investor_type', v_investor_type)
    end;
    if v_amount <> '' then
      v_headline := v_headline || ' - ' || btrim(coalesce(nullif(v_currency, ''), '') || ' ' || v_amount);
    end if;
  end if;

  update public.join_applications
  set headline = btrim(coalesce(v_headline, '')),
      display_name = v_display_name,
      contact_email = public.join_answer_text(p_application_id, 'email'),
      contact_phone = public.join_answer_text(p_application_id, 'phone'),
      country = public.join_answer_text(p_application_id, 'country'),
      city = public.join_answer_text(p_application_id, 'city')
  where id = p_application_id;
end;
$$;

create or replace function public.join_answers_refresh_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.join_refresh_application_profile(coalesce(new.application_id, old.application_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists join_answers_refresh_profile on public.join_answers;
create trigger join_answers_refresh_profile
after insert or update or delete on public.join_answers
for each row execute function public.join_answers_refresh_profile();

-- ---------------------------------------------------------------------------
-- Applicants may only edit their own draft, and only the fields they own.
-- ---------------------------------------------------------------------------

-- Deliberately invoker rights: the guard needs to see which role is actually
-- performing the write. A SECURITY DEFINER trigger would always report its own
-- owner and would therefore never enforce anything.
create or replace function public.join_guard_applicant_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The audited RPCs are SECURITY DEFINER and therefore execute as the table
  -- owner. A write arriving as any other role is a direct table write by the
  -- applicant, and only they are restricted here.
  if current_user = (
       select pg_get_userbyid(relowner) from pg_class where oid = 'public.join_applications'::regclass
     ) then
    return new;
  end if;

  if public.admin_has_permission('join.manage') then
    return new;
  end if;

  if old.user_id is distinct from auth.uid() then
    raise exception 'This application belongs to another account';
  end if;

  if new.user_id <> old.user_id
     or new.application_type <> old.application_type
     or new.reference is distinct from old.reference
     or new.application_number is distinct from old.application_number
     or new.status <> old.status
     or new.assigned_admin_id is distinct from old.assigned_admin_id
     or new.priority <> old.priority
     or new.reviewer_score is distinct from old.reviewer_score
     or new.score_breakdown <> old.score_breakdown
     or new.decision is distinct from old.decision
     or new.decision_reason <> old.decision_reason
     or new.decided_at is distinct from old.decided_at
     or new.decided_by is distinct from old.decided_by
     or new.submitted_at is distinct from old.submitted_at
     or new.applicant_unread_count <> old.applicant_unread_count
     or new.admin_unread_count <> old.admin_unread_count
     or new.created_at <> old.created_at then
    raise exception 'Only the acknowledgements on a draft application can be changed here';
  end if;

  return new;
end;
$$;

drop trigger if exists join_applications_guard_applicant_update on public.join_applications;
create trigger join_applications_guard_applicant_update
before update on public.join_applications
for each row execute function public.join_guard_applicant_update();

-- ---------------------------------------------------------------------------
-- Applicant RPCs
-- ---------------------------------------------------------------------------

create or replace function public.join_start_application(p_type text)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
begin
  if actor is null then
    raise exception 'Sign in to apply to KunThai';
  end if;
  if p_type not in ('staff','volunteer','investor') then
    raise exception 'Unknown application path';
  end if;

  select * into application
  from public.join_applications
  where user_id = actor and application_type = p_type and status = 'draft'
  limit 1;

  if application.id is not null then
    return application;
  end if;

  if exists (
    select 1 from public.join_applications
    where user_id = actor
      and application_type = p_type
      and status in ('submitted','under_review','shortlisted','assessment','interview','due_diligence','offer')
  ) then
    raise exception 'You already have an application in review on this path. Track it from My Applications.';
  end if;

  insert into public.join_applications (user_id, application_type)
  values (actor, p_type)
  returning * into application;

  insert into public.join_status_history (application_id, from_status, to_status, changed_by, actor_role, reason)
  values (application.id, '', 'draft', actor, 'applicant', 'Application started');

  return application;
end;
$$;

create or replace function public.join_submit_application(p_application_id uuid)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
  missing text;
  next_ref record;
begin
  if actor is null then
    raise exception 'Sign in to submit your application';
  end if;

  select * into application from public.join_applications where id = p_application_id for update;
  if application.id is null or application.user_id <> actor then
    raise exception 'Application not found';
  end if;
  if application.status <> 'draft' then
    raise exception 'This application has already been submitted';
  end if;
  if application.consent_accepted_at is null then
    raise exception 'Accept the acknowledgements before submitting';
  end if;

  -- Questions whose visibility depends on other answers are validated in the
  -- application form. The unconditional required set is enforced here so an
  -- incomplete application can never reach the review queue.
  select string_agg(definition.label, ', ' order by definition.section_order, definition.question_order)
  into missing
  from public.join_question_definitions definition
  where definition.application_type = application.application_type
    and definition.active
    and definition.required
    and definition.input_type <> 'statement'
    and not exists (
      select 1 from public.join_conditional_rules rule
      where rule.application_type = definition.application_type
        and rule.question_key = definition.question_key
        and rule.active
    )
    and not exists (
      select 1 from public.join_answers answer
      where answer.application_id = application.id
        and answer.question_key = definition.question_key
        and answer.value is not null
        and jsonb_typeof(answer.value) <> 'null'
        and case
          when jsonb_typeof(answer.value) = 'array' then jsonb_array_length(answer.value) > 0
          when jsonb_typeof(answer.value) = 'string' then btrim(answer.value #>> '{}') <> ''
          else true
        end
    );

  if missing is not null then
    raise exception 'Complete these questions before submitting: %', missing;
  end if;

  select * into next_ref from public.join_next_reference(application.application_type);

  update public.join_applications
  set status = 'submitted',
      reference = next_ref.reference,
      application_number = next_ref.application_number,
      submitted_at = now(),
      last_activity_at = now()
  where id = application.id
  returning * into application;

  perform public.join_refresh_application_profile(application.id);
  select * into application from public.join_applications where id = application.id;

  insert into public.join_status_history (application_id, from_status, to_status, changed_by, actor_role, reason)
  values (application.id, 'draft', 'submitted', actor, 'applicant', 'Application submitted');

  insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
  values (
    actor,
    'platform',
    'join_application_submitted',
    'Application received',
    'Your application ' || application.reference || ' is with the KunThai team. Track it from Join KunThai.',
    'normal',
    'explore:join-kunthai'
  );

  return application;
end;
$$;

create or replace function public.join_withdraw_application(p_application_id uuid, p_reason text default '')
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
begin
  select * into application from public.join_applications where id = p_application_id for update;
  if application.id is null or application.user_id <> actor then
    raise exception 'Application not found';
  end if;
  if application.status not in ('submitted','under_review','shortlisted','assessment','interview','due_diligence','offer') then
    raise exception 'This application can no longer be withdrawn';
  end if;

  update public.join_applications
  set status = 'withdrawn', last_activity_at = now()
  where id = application.id
  returning * into application;

  insert into public.join_status_history (application_id, from_status, to_status, changed_by, actor_role, reason)
  values (application.id, application.status, 'withdrawn', actor, 'applicant', coalesce(btrim(p_reason), ''));

  return application;
end;
$$;

create or replace function public.join_post_application_message(p_application_id uuid, p_body text)
returns public.join_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
  body text := btrim(coalesce(p_body, ''));
  created public.join_messages;
  role text;
begin
  if actor is null then
    raise exception 'Sign in to send this message';
  end if;
  if char_length(body) = 0 then
    raise exception 'Write a message first';
  end if;
  if char_length(body) > 4000 then
    raise exception 'Messages are limited to 4000 characters';
  end if;

  select * into application from public.join_applications where id = p_application_id for update;
  if application.id is null then
    raise exception 'Application not found';
  end if;

  if application.user_id = actor then
    role := 'applicant';
    if application.status = 'draft' then
      raise exception 'Submit your application before messaging the team';
    end if;
  elsif public.admin_has_permission('join.manage') then
    role := 'recruitment';
  else
    raise exception 'Not authorized';
  end if;

  insert into public.join_messages (application_id, sender_role, sender_id, body)
  values (application.id, role, actor, body)
  returning * into created;

  if role = 'applicant' then
    update public.join_applications
    set admin_unread_count = admin_unread_count + 1, last_activity_at = now()
    where id = application.id;
  else
    update public.join_applications
    set applicant_unread_count = applicant_unread_count + 1, last_activity_at = now()
    where id = application.id;

    insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
    values (
      application.user_id,
      'platform',
      'join_application_message',
      'KunThai replied to your application',
      'The KunThai team sent a message about ' || coalesce(application.reference, 'your application') || '.',
      'normal',
      'explore:join-kunthai'
    );

    perform public.admin_log_action(
      'join.message_sent', 'platform', 'join_application', application.id, null, ''
    );
  end if;

  return created;
end;
$$;

create or replace function public.join_mark_application_read(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
begin
  select * into application from public.join_applications where id = p_application_id;
  if application.id is null then
    return;
  end if;

  if application.user_id = actor then
    update public.join_applications set applicant_unread_count = 0 where id = application.id;
    update public.join_messages set read_at = now()
    where application_id = application.id and sender_role = 'recruitment' and read_at is null;
  elsif public.admin_has_permission('join.view') then
    update public.join_applications set admin_unread_count = 0 where id = application.id;
    update public.join_messages set read_at = now()
    where application_id = application.id and sender_role = 'applicant' and read_at is null;
  end if;
end;
$$;

create or replace function public.join_submit_assessment(p_assessment_id uuid, p_response text)
returns public.join_assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  assessment public.join_assessments;
  application public.join_applications;
  submitted_response text := btrim(coalesce(p_response, ''));
begin
  select * into assessment from public.join_assessments where id = p_assessment_id for update;
  if assessment.id is null then
    raise exception 'Assessment not found';
  end if;

  select * into application from public.join_applications where id = assessment.application_id;
  if application.user_id <> actor then
    raise exception 'Not authorized';
  end if;
  if assessment.status <> 'assigned' then
    raise exception 'This assessment has already been submitted';
  end if;
  if char_length(submitted_response) < 20 then
    raise exception 'Write a fuller answer before submitting';
  end if;

  update public.join_assessments
  set response = submitted_response, status = 'submitted', submitted_at = now()
  where id = assessment.id
  returning * into assessment;

  update public.join_applications set last_activity_at = now(), admin_unread_count = admin_unread_count + 1
  where id = application.id;

  return assessment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrative RPCs
-- ---------------------------------------------------------------------------

create or replace function public.join_admin_set_status(
  p_application_id uuid,
  p_status text,
  p_reason text default ''
)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
  previous_status text;
  next_decision text;
  notification_title text;
  notification_body text;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('submitted','under_review','shortlisted','assessment','interview','due_diligence','offer','accepted','rejected','archived') then
    raise exception 'Unknown application status';
  end if;

  select * into application from public.join_applications where id = p_application_id for update;
  if application.id is null then
    raise exception 'Application not found';
  end if;
  if application.status = 'draft' then
    raise exception 'A draft application is not in the review pipeline yet';
  end if;
  if application.status in ('withdrawn') then
    raise exception 'This application was withdrawn by the applicant';
  end if;
  if p_status in ('accepted','rejected') and not public.admin_has_permission('join.decide') then
    raise exception 'A final decision requires the join.decide permission';
  end if;

  previous_status := application.status;
  next_decision := case p_status when 'accepted' then 'approved' when 'rejected' then 'rejected' else application.decision end;

  update public.join_applications
  set status = p_status,
      decision = next_decision,
      decision_reason = case when p_status in ('accepted','rejected') then coalesce(btrim(p_reason), '') else application.decision_reason end,
      decided_at = case when p_status in ('accepted','rejected') then now() else application.decided_at end,
      decided_by = case when p_status in ('accepted','rejected') then actor else application.decided_by end,
      last_activity_at = now()
  where id = application.id
  returning * into application;

  insert into public.join_status_history (application_id, from_status, to_status, changed_by, actor_role, reason)
  values (application.id, previous_status, p_status, actor, 'admin', coalesce(btrim(p_reason), ''));

  notification_title := case p_status
    when 'under_review' then 'Your application is under review'
    when 'shortlisted' then 'You have been shortlisted'
    when 'assessment' then 'A KunThai assessment is waiting for you'
    when 'interview' then 'KunThai would like to speak with you'
    when 'due_diligence' then 'Your investment interest is in review'
    when 'offer' then 'KunThai has an update on your application'
    when 'accepted' then 'Your application was accepted'
    when 'rejected' then 'Update on your KunThai application'
    else 'Application update'
  end;
  notification_body := coalesce(
    nullif(btrim(p_reason), ''),
    'Open Join KunThai to see the latest status of ' || coalesce(application.reference, 'your application') || '.'
  );

  if p_status <> 'archived' then
    insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
    values (
      application.user_id, 'platform', 'join_application_status',
      notification_title, notification_body,
      case when p_status in ('accepted','rejected','offer') then 'high' else 'normal' end,
      'explore:join-kunthai'
    );
  end if;

  perform public.admin_log_action(
    'join.status_changed', 'platform', 'join_application', application.id, null,
    coalesce(btrim(p_reason), ''),
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', p_status)
  );

  return application;
end;
$$;

create or replace function public.join_admin_assign(p_application_id uuid, p_admin_id uuid)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_admin_id is not null and not public.admin_has_permission('join.view', null::text, p_admin_id) then
    raise exception 'That administrator cannot review Join KunThai applications';
  end if;

  update public.join_applications
  set assigned_admin_id = p_admin_id, last_activity_at = now()
  where id = p_application_id
  returning * into application;

  if application.id is null then
    raise exception 'Application not found';
  end if;

  perform public.admin_log_action('join.assigned', 'platform', 'join_application', application.id);
  return application;
end;
$$;

create or replace function public.join_admin_set_priority(p_application_id uuid, p_priority text)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Unknown priority';
  end if;

  update public.join_applications
  set priority = p_priority, last_activity_at = now()
  where id = p_application_id
  returning * into application;

  if application.id is null then
    raise exception 'Application not found';
  end if;
  return application;
end;
$$;

create or replace function public.join_admin_score_application(
  p_application_id uuid,
  p_score numeric,
  p_breakdown jsonb default '{}'::jsonb
)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'A review score must be between 0 and 100';
  end if;

  update public.join_applications
  set reviewer_score = p_score,
      score_breakdown = coalesce(p_breakdown, '{}'::jsonb),
      last_activity_at = now()
  where id = p_application_id
  returning * into application;

  if application.id is null then
    raise exception 'Application not found';
  end if;
  return application;
end;
$$;

create or replace function public.join_admin_assign_assessment(
  p_application_id uuid,
  p_assessment_key text,
  p_title text,
  p_prompt text,
  p_due_at timestamptz default null
)
returns public.join_assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  application public.join_applications;
  created public.join_assessments;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if char_length(btrim(coalesce(p_prompt, ''))) < 20 then
    raise exception 'Write the assessment scenario before sending it';
  end if;

  select * into application from public.join_applications where id = p_application_id;
  if application.id is null then
    raise exception 'Application not found';
  end if;

  insert into public.join_assessments (application_id, assessment_key, title, prompt, assigned_by, due_at)
  values (
    application.id,
    coalesce(nullif(btrim(p_assessment_key), ''), 'general'),
    coalesce(nullif(btrim(p_title), ''), 'KunThai assessment'),
    btrim(p_prompt),
    actor,
    p_due_at
  )
  returning * into created;

  update public.join_applications
  set applicant_unread_count = applicant_unread_count + 1, last_activity_at = now()
  where id = application.id;

  insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
  values (
    application.user_id, 'platform', 'join_application_assessment',
    'A KunThai assessment is waiting for you',
    'Open Join KunThai to answer the assessment for ' || coalesce(application.reference, 'your application') || '.',
    'high', 'explore:join-kunthai'
  );

  perform public.admin_log_action('join.assessment_assigned', 'platform', 'join_application', application.id);
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin permissions
-- ---------------------------------------------------------------------------

insert into public.admin_permissions (permission_key, name, permission_group)
values
  ('join.view', 'View Join KunThai applications', 'join'),
  ('join.manage', 'Progress Join KunThai applications', 'join'),
  ('join.decide', 'Accept or decline Join KunThai applications', 'join')
on conflict (permission_key) do update
set name = excluded.name,
    permission_group = excluded.permission_group;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.permission_key
from public.admin_roles role
cross join (values ('join.view'), ('join.manage'), ('join.decide')) as permission(permission_key)
where role.role_key in ('super_admin', 'chief_admin')
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.permission_key
from public.admin_roles role
cross join (values ('join.view'), ('join.manage')) as permission(permission_key)
where role.role_key in ('operations_lead')
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, 'join.view'
from public.admin_roles role
where role.role_key in ('analyst', 'auditor')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.join_applications enable row level security;
alter table public.join_applicant_profiles enable row level security;
alter table public.join_answers enable row level security;
alter table public.join_education enable row level security;
alter table public.join_experience enable row level security;
alter table public.join_skills enable row level security;
alter table public.join_documents enable row level security;
alter table public.join_status_history enable row level security;
alter table public.join_admin_notes enable row level security;
alter table public.join_reviews enable row level security;
alter table public.join_assessments enable row level security;
alter table public.join_messages enable row level security;
alter table public.join_question_definitions enable row level security;
alter table public.join_question_options enable row level security;
alter table public.join_conditional_rules enable row level security;

drop policy if exists "Applicants read own join applications" on public.join_applications;
create policy "Applicants read own join applications"
on public.join_applications for select to authenticated
using (user_id = auth.uid() or public.admin_has_permission('join.view'));

drop policy if exists "Applicants edit own draft applications" on public.join_applications;
create policy "Applicants edit own draft applications"
on public.join_applications for update to authenticated
using ((user_id = auth.uid() and status = 'draft') or public.admin_has_permission('join.manage'))
with check ((user_id = auth.uid() and status = 'draft') or public.admin_has_permission('join.manage'));

drop policy if exists "Applicants delete own draft applications" on public.join_applications;
create policy "Applicants delete own draft applications"
on public.join_applications for delete to authenticated
using (user_id = auth.uid() and status = 'draft');

drop policy if exists "Applicants read own join profile" on public.join_applicant_profiles;
create policy "Applicants read own join profile"
on public.join_applicant_profiles for select to authenticated
using (
  exists (select 1 from public.join_applications app where app.id = application_id and app.user_id = auth.uid())
  or public.admin_has_permission('join.view')
);

do $policies$
declare
  child_table text;
begin
  foreach child_table in array array['join_answers','join_education','join_experience','join_skills','join_documents'] loop
    execute format('drop policy if exists "Applicants read own %1$s" on public.%1$I', child_table);
    execute format($policy$
      create policy "Applicants read own %1$s"
      on public.%1$I for select to authenticated
      using (
        exists (select 1 from public.join_applications app where app.id = application_id and app.user_id = auth.uid())
        or public.admin_has_permission('join.view')
      )
    $policy$, child_table);

    execute format('drop policy if exists "Applicants add own %1$s" on public.%1$I', child_table);
    execute format($policy$
      create policy "Applicants add own %1$s"
      on public.%1$I for insert to authenticated
      with check (
        exists (
          select 1 from public.join_applications app
          where app.id = application_id and app.user_id = auth.uid() and app.status = 'draft'
        )
      )
    $policy$, child_table);

    execute format('drop policy if exists "Applicants change own %1$s" on public.%1$I', child_table);
    execute format($policy$
      create policy "Applicants change own %1$s"
      on public.%1$I for update to authenticated
      using (
        exists (
          select 1 from public.join_applications app
          where app.id = application_id and app.user_id = auth.uid() and app.status = 'draft'
        )
      )
      with check (
        exists (
          select 1 from public.join_applications app
          where app.id = application_id and app.user_id = auth.uid() and app.status = 'draft'
        )
      )
    $policy$, child_table);

    execute format('drop policy if exists "Applicants remove own %1$s" on public.%1$I', child_table);
    execute format($policy$
      create policy "Applicants remove own %1$s"
      on public.%1$I for delete to authenticated
      using (
        exists (
          select 1 from public.join_applications app
          where app.id = application_id and app.user_id = auth.uid() and app.status = 'draft'
        )
      )
    $policy$, child_table);
  end loop;
end;
$policies$;

drop policy if exists "Applicants read own join status history" on public.join_status_history;
create policy "Applicants read own join status history"
on public.join_status_history for select to authenticated
using (
  exists (select 1 from public.join_applications app where app.id = application_id and app.user_id = auth.uid())
  or public.admin_has_permission('join.view')
);

drop policy if exists "Reviewers read join admin notes" on public.join_admin_notes;
create policy "Reviewers read join admin notes"
on public.join_admin_notes for select to authenticated
using (public.admin_has_permission('join.view'));

drop policy if exists "Reviewers write join admin notes" on public.join_admin_notes;
create policy "Reviewers write join admin notes"
on public.join_admin_notes for insert to authenticated
with check (author_id = auth.uid() and public.admin_has_permission('join.manage'));

drop policy if exists "Reviewers read join reviews" on public.join_reviews;
create policy "Reviewers read join reviews"
on public.join_reviews for select to authenticated
using (public.admin_has_permission('join.view'));

drop policy if exists "Reviewers record join reviews" on public.join_reviews;
create policy "Reviewers record join reviews"
on public.join_reviews for insert to authenticated
with check (reviewer_id = auth.uid() and public.admin_has_permission('join.manage'));

drop policy if exists "Reviewers update own join reviews" on public.join_reviews;
create policy "Reviewers update own join reviews"
on public.join_reviews for update to authenticated
using (reviewer_id = auth.uid() and public.admin_has_permission('join.manage'))
with check (reviewer_id = auth.uid() and public.admin_has_permission('join.manage'));

drop policy if exists "Applicants read own join assessments" on public.join_assessments;
create policy "Applicants read own join assessments"
on public.join_assessments for select to authenticated
using (
  exists (select 1 from public.join_applications app where app.id = application_id and app.user_id = auth.uid())
  or public.admin_has_permission('join.view')
);

drop policy if exists "Reviewers manage join assessments" on public.join_assessments;
create policy "Reviewers manage join assessments"
on public.join_assessments for update to authenticated
using (public.admin_has_permission('join.manage'))
with check (public.admin_has_permission('join.manage'));

drop policy if exists "Participants read join messages" on public.join_messages;
create policy "Participants read join messages"
on public.join_messages for select to authenticated
using (
  exists (select 1 from public.join_applications app where app.id = application_id and app.user_id = auth.uid())
  or public.admin_has_permission('join.view')
);

drop policy if exists "Everyone reads active join questions" on public.join_question_definitions;
create policy "Everyone reads active join questions"
on public.join_question_definitions for select to authenticated
using (active or public.admin_has_permission('join.view'));

drop policy if exists "Everyone reads active join options" on public.join_question_options;
create policy "Everyone reads active join options"
on public.join_question_options for select to authenticated
using (active or public.admin_has_permission('join.view'));

drop policy if exists "Everyone reads active join rules" on public.join_conditional_rules;
create policy "Everyone reads active join rules"
on public.join_conditional_rules for select to authenticated
using (active or public.admin_has_permission('join.view'));

revoke all on table public.join_applications, public.join_applicant_profiles, public.join_answers,
  public.join_education, public.join_experience, public.join_skills, public.join_documents,
  public.join_status_history, public.join_admin_notes, public.join_reviews, public.join_assessments,
  public.join_messages, public.join_question_definitions, public.join_question_options,
  public.join_conditional_rules
from anon;

grant select on table public.join_applicant_profiles, public.join_status_history,
  public.join_question_definitions, public.join_question_options, public.join_conditional_rules
to authenticated;
grant select, update, delete on table public.join_applications to authenticated;
grant select, insert, update, delete on table public.join_answers, public.join_education,
  public.join_experience, public.join_skills, public.join_documents to authenticated;
grant select, insert, update on table public.join_admin_notes, public.join_reviews to authenticated;
grant select, update on table public.join_assessments to authenticated;
grant select on table public.join_messages to authenticated;

revoke all on function public.join_next_reference(text) from public, anon, authenticated;
revoke all on function public.join_refresh_application_profile(uuid) from public, anon, authenticated;

grant execute on function public.join_start_application(text) to authenticated;
grant execute on function public.join_submit_application(uuid) to authenticated;
grant execute on function public.join_withdraw_application(uuid, text) to authenticated;
grant execute on function public.join_post_application_message(uuid, text) to authenticated;
grant execute on function public.join_mark_application_read(uuid) to authenticated;
grant execute on function public.join_submit_assessment(uuid, text) to authenticated;
grant execute on function public.join_admin_set_status(uuid, text, text) to authenticated;
grant execute on function public.join_admin_assign(uuid, uuid) to authenticated;
grant execute on function public.join_admin_set_priority(uuid, text) to authenticated;
grant execute on function public.join_admin_score_application(uuid, numeric, jsonb) to authenticated;
grant execute on function public.join_admin_assign_assessment(uuid, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Application documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'join-applications',
  'join-applications',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Applicants upload own join documents" on storage.objects;
create policy "Applicants upload own join documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'join-applications'
  and (storage.foldername(name))[1] = 'join'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Applicants read own join documents" on storage.objects;
create policy "Applicants read own join documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'join-applications'
  and (
    ((storage.foldername(name))[1] = 'join' and (storage.foldername(name))[2] = auth.uid()::text)
    or public.admin_has_permission('join.view')
  )
);

drop policy if exists "Applicants remove own join documents" on storage.objects;
create policy "Applicants remove own join documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'join-applications'
  and (storage.foldername(name))[1] = 'join'
  and (storage.foldername(name))[2] = auth.uid()::text
);

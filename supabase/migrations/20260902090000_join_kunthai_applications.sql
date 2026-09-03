-- Join KunThai: recruitment, volunteer, and investor application system.
--
-- Design notes
--   * Every application is one row in join_applications. Type-specific detail
--     lives in dynamic answers (join_answers) plus repeatable list tables, so a
--     new question never requires an app release.
--   * Questions, options, and the conditional logic that shows them are stored
--     in join_question_definitions / join_question_options /
--     join_conditional_rules and hydrated by the client, mirroring the way
--     KunThai already keeps country and feature rules in the database.
--   * Nothing in this schema promises equity, a percentage, a valuation, or
--     employment. An investor application records a proposed amount and an
--     expression of interest only; terms are settled outside the product.
--   * Applicants own their draft. Once submitted the row becomes read-only to
--     them and every state change flows through audited security-definer RPCs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Reference numbering (KTH-STAFF-000142 / KTH-VOL-000087 / KTH-INV-000014)
-- ---------------------------------------------------------------------------

create table if not exists public.join_application_counters (
  application_type text primary key,
  last_number bigint not null default 0
);

insert into public.join_application_counters (application_type, last_number)
values ('staff', 0), ('volunteer', 0), ('investor', 0)
on conflict (application_type) do nothing;

alter table public.join_application_counters enable row level security;
revoke all on table public.join_application_counters from anon, authenticated;

create or replace function public.join_next_reference(p_type text)
returns table (reference text, application_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number bigint;
  prefix text;
begin
  insert into public.join_application_counters (application_type, last_number)
  values (p_type, 1)
  on conflict (application_type)
  do update set last_number = public.join_application_counters.last_number + 1
  returning public.join_application_counters.last_number into next_number;

  prefix := case p_type
    when 'staff' then 'KTH-STAFF'
    when 'volunteer' then 'KTH-VOL'
    when 'investor' then 'KTH-INV'
    else 'KTH-APP'
  end;

  reference := prefix || '-' || lpad(next_number::text, 6, '0');
  application_number := next_number;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core application record
-- ---------------------------------------------------------------------------

create table if not exists public.join_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_type text not null check (application_type in ('staff','volunteer','investor')),
  reference text unique,
  application_number bigint,
  status text not null default 'draft' check (status in (
    'draft','submitted','under_review','shortlisted','assessment',
    'interview','due_diligence','offer','accepted','rejected','withdrawn','archived'
  )),
  headline text not null default '',
  display_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  country text not null default '',
  city text not null default '',
  assigned_admin_id uuid references auth.users(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reviewer_score numeric(5,2),
  score_breakdown jsonb not null default '{}'::jsonb,
  consent jsonb not null default '{}'::jsonb,
  consent_accepted_at timestamptz,
  decision text check (decision is null or decision in ('approved','rejected','on_hold')),
  decision_reason text not null default '',
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  last_activity_at timestamptz not null default now(),
  applicant_unread_count integer not null default 0,
  admin_unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists join_applications_user_idx
  on public.join_applications(user_id, created_at desc);
create index if not exists join_applications_queue_idx
  on public.join_applications(application_type, status, created_at desc);
create index if not exists join_applications_assigned_idx
  on public.join_applications(assigned_admin_id, status)
  where assigned_admin_id is not null;

-- One draft, and one live application, per person per path.
create unique index if not exists join_applications_single_draft_idx
  on public.join_applications(user_id, application_type)
  where status = 'draft';
create unique index if not exists join_applications_single_active_idx
  on public.join_applications(user_id, application_type)
  where status in ('submitted','under_review','shortlisted','assessment','interview','due_diligence','offer');

-- ---------------------------------------------------------------------------
-- Queryable profile mirror (populated from answers, never hand-written)
-- ---------------------------------------------------------------------------

create table if not exists public.join_applicant_profiles (
  application_id uuid primary key references public.join_applications(id) on delete cascade,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  date_of_birth date,
  nationality text not null default '',
  country text not null default '',
  city text not null default '',
  occupation text not null default '',
  employer text not null default '',
  linkedin_url text not null default '',
  github_url text not null default '',
  portfolio_url text not null default '',
  website_url text not null default '',
  entity_name text not null default '',
  entity_type text not null default '',
  registration_country text not null default '',
  registration_number text not null default '',
  representative_name text not null default '',
  representative_position text not null default '',
  preferred_location text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Dynamic answers
-- ---------------------------------------------------------------------------

create table if not exists public.join_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  question_key text not null,
  value jsonb not null default 'null'::jsonb,
  answered_at timestamptz not null default now(),
  unique (application_id, question_key)
);

create index if not exists join_answers_application_idx
  on public.join_answers(application_id);

-- ---------------------------------------------------------------------------
-- Repeatable sections
-- ---------------------------------------------------------------------------

create table if not exists public.join_education (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  level text not null default '',
  institution text not null default '',
  country text not null default '',
  field_of_study text not null default '',
  qualification text not null default '',
  start_year integer check (start_year is null or start_year between 1900 and 2200),
  end_year integer check (end_year is null or end_year between 1900 and 2200),
  currently_studying boolean not null default false,
  achievements text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.join_experience (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  organization text not null default '',
  position_title text not null default '',
  employment_type text not null default '',
  start_date date,
  end_date date,
  currently_here boolean not null default false,
  responsibilities text not null default '',
  may_contact boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.join_skills (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  skill text not null default '',
  proficiency text not null default 'intermediate'
    check (proficiency in ('beginner','basic','intermediate','advanced','expert')),
  years_experience text not null default ''
    check (years_experience in ('','under_1','1_2','3_5','6_10','10_plus')),
  context text not null default '',
  evidence_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.join_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  document_type text not null default 'supporting'
    check (document_type in ('cv','cover_letter','certificate','portfolio','supporting')),
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null default '',
  byte_size bigint not null default 0,
  uploaded_at timestamptz not null default now()
);

create index if not exists join_education_application_idx on public.join_education(application_id, sort_order);
create index if not exists join_experience_application_idx on public.join_experience(application_id, sort_order);
create index if not exists join_skills_application_idx on public.join_skills(application_id, sort_order);
create index if not exists join_documents_application_idx on public.join_documents(application_id, uploaded_at);

-- ---------------------------------------------------------------------------
-- Review workflow
-- ---------------------------------------------------------------------------

create table if not exists public.join_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  from_status text not null default '',
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  actor_role text not null default 'system' check (actor_role in ('applicant','admin','system')),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists join_status_history_application_idx
  on public.join_status_history(application_id, created_at desc);

create table if not exists public.join_admin_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.join_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  rating smallint check (rating is null or rating between 1 and 5),
  recommendation text not null default 'undecided'
    check (recommendation in ('advance','hold','decline','undecided')),
  strengths text not null default '',
  concerns text not null default '',
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (application_id, reviewer_id)
);

create table if not exists public.join_assessments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  assessment_key text not null default 'general',
  title text not null default 'KunThai assessment',
  prompt text not null default '',
  response text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned','submitted','reviewed','expired','cancelled')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  submitted_at timestamptz,
  reviewer_score numeric(5,2),
  reviewer_notes text not null default ''
);

create index if not exists join_assessments_application_idx
  on public.join_assessments(application_id, assigned_at desc);

create table if not exists public.join_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.join_applications(id) on delete cascade,
  sender_role text not null check (sender_role in ('applicant','recruitment')),
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists join_messages_application_idx
  on public.join_messages(application_id, created_at);

-- ---------------------------------------------------------------------------
-- Questionnaire engine
-- ---------------------------------------------------------------------------

-- A question key is semantic (first_name, why_kunthai) and shared across paths,
-- so the catalogue is keyed by path plus key. An application has exactly one
-- path, which keeps join_answers.question_key unambiguous.
create table if not exists public.join_question_definitions (
  application_type text not null check (application_type in ('staff','volunteer','investor')),
  question_key text not null,
  section_key text not null,
  section_title text not null default '',
  section_description text not null default '',
  section_order integer not null default 0,
  question_order integer not null default 0,
  label text not null,
  helper text not null default '',
  placeholder text not null default '',
  input_type text not null check (input_type in (
    'short_text','long_text','email','phone','url','number','currency',
    'date','year','select','multi_select','boolean','country','statement'
  )),
  required boolean not null default false,
  max_length integer,
  min_value numeric,
  max_value numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (application_type, question_key)
);

create index if not exists join_question_definitions_type_idx
  on public.join_question_definitions(application_type, section_order, question_order)
  where active;

create table if not exists public.join_question_options (
  id uuid primary key default gen_random_uuid(),
  application_type text not null,
  question_key text not null,
  value text not null,
  label text not null,
  option_order integer not null default 0,
  active boolean not null default true,
  unique (application_type, question_key, value),
  foreign key (application_type, question_key)
    references public.join_question_definitions(application_type, question_key) on delete cascade
);

create index if not exists join_question_options_question_idx
  on public.join_question_options(application_type, question_key, option_order);

-- conditions is an array of {key, op, value} tests evaluated against the
-- answers already given, for example
--   [{"key": "investor_type", "op": "in", "value": ["company","fund"]}]
create table if not exists public.join_conditional_rules (
  id uuid primary key default gen_random_uuid(),
  application_type text not null,
  question_key text not null,
  match_mode text not null default 'all' check (match_mode in ('all','any')),
  conditions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (application_type, question_key),
  foreign key (application_type, question_key)
    references public.join_question_definitions(application_type, question_key) on delete cascade
);

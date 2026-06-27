create extension if not exists pgcrypto;

create or replace function public.transport_company_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.transport_companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_code text not null,
  owner_public_id text,
  company_name text not null,
  company_type text not null default 'Transport company',
  registration_number text,
  tax_id text,
  owner_name text not null,
  phone text not null,
  email text,
  country text,
  city text,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  operating_areas text[] not null default '{}',
  support_policy text,
  documents jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending',
  account_status text not null default 'draft',
  admin_note text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transport_companies
  add column if not exists owner_public_id text,
  add column if not exists registration_number text,
  add column if not exists tax_id text,
  add column if not exists email text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists operating_areas text[] not null default '{}',
  add column if not exists support_policy text,
  add column if not exists documents jsonb not null default '{}'::jsonb,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists account_status text not null default 'draft',
  add column if not exists admin_note text,
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_owner_unique unique (owner_user_id);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_code_unique unique (company_code);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_name_required check (length(btrim(company_name)) > 1);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_owner_name_required check (length(btrim(owner_name)) > 1);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_phone_required check (length(btrim(phone)) >= 5);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_latitude_check check (latitude is null or latitude between -90 and 90);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_longitude_check check (longitude is null or longitude between -180 and 180);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_account_status_check
    check (account_status in ('draft', 'submitted', 'approved', 'rejected', 'suspended', 'archived'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_companies
    add constraint transport_companies_verification_status_check
    check (verification_status in ('pending', 'pending_review', 'under_review', 'verified', 'rejected', 'suspended'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

create table if not exists public.transport_company_fleets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  fleet_code text not null,
  service_category text not null default 'Ride and delivery',
  fleet_type text not null default 'Motorbike',
  fleet_name text,
  plate_number text,
  make text,
  model text,
  manufacture_year int,
  color text,
  operating_area text,
  home_base_location text,
  documents jsonb not null default '{}'::jsonb,
  safety_answers jsonb not null default '{}'::jsonb,
  operators jsonb not null default '[]'::jsonb,
  verification_status text not null default 'pending_review',
  active_status text not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transport_company_fleets
  add column if not exists service_category text not null default 'Ride and delivery',
  add column if not exists fleet_type text not null default 'Motorbike',
  add column if not exists fleet_name text,
  add column if not exists plate_number text,
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists manufacture_year int,
  add column if not exists color text,
  add column if not exists operating_area text,
  add column if not exists home_base_location text,
  add column if not exists documents jsonb not null default '{}'::jsonb,
  add column if not exists safety_answers jsonb not null default '{}'::jsonb,
  add column if not exists operators jsonb not null default '[]'::jsonb,
  add column if not exists verification_status text not null default 'pending_review',
  add column if not exists active_status text not null default 'offline',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_company_code_unique unique (company_id, fleet_code);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_year_check
    check (manufacture_year is null or manufacture_year between 1950 and extract(year from now())::int + 1);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_service_category_check
    check (service_category in ('Ride only', 'Delivery only', 'Ride and delivery'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_type_check
    check (fleet_type in ('Motorbike', 'Tricycle', 'Taxi', 'Van'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_active_status_check
    check (active_status in ('active', 'offline', 'maintenance', 'booked'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_verification_status_check
    check (verification_status in ('pending_review', 'pending', 'under_review', 'verified', 'rejected', 'suspended'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

create table if not exists public.transport_company_operator_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  company_fleet_id uuid references public.transport_company_fleets(id) on delete cascade,
  fleet_code text,
  request_id text not null,
  operator_id uuid references public.transport_operators(id) on delete set null,
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_public_id text not null,
  operator_name text,
  operator_city text,
  verification_status text,
  status text not null default 'pending',
  documents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.transport_company_operator_invites
  add column if not exists company_fleet_id uuid references public.transport_company_fleets(id) on delete cascade,
  add column if not exists fleet_code text,
  add column if not exists request_id text,
  add column if not exists operator_id uuid references public.transport_operators(id) on delete set null,
  add column if not exists operator_user_id uuid references auth.users(id) on delete set null,
  add column if not exists operator_public_id text,
  add column if not exists operator_name text,
  add column if not exists operator_city text,
  add column if not exists verification_status text,
  add column if not exists status text not null default 'pending',
  add column if not exists documents jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists responded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.transport_company_operator_invites
    add constraint transport_company_operator_invites_request_unique unique (company_id, request_id);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_operator_invites
    add constraint transport_company_operator_invites_operator_fleet_unique unique (company_id, operator_public_id, fleet_code);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_operator_invites
    add constraint transport_company_operator_invites_status_check
    check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'revoked'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

create table if not exists public.transport_company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  public_id text,
  full_name text,
  role text not null default 'operator',
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transport_company_members
  add column if not exists public_id text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'operator',
  add column if not exists status text not null default 'pending',
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists joined_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.transport_company_members
    add constraint transport_company_members_company_user_unique unique (company_id, user_id);
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_members
    add constraint transport_company_members_role_check
    check (role in ('owner', 'admin', 'fleet_manager', 'dispatcher', 'operator'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.transport_company_members
    add constraint transport_company_members_status_check
    check (status in ('pending', 'active', 'rejected', 'removed', 'suspended'));
exception
  when duplicate_object or duplicate_table then null;
end $$;

create table if not exists public.transport_company_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null default 'system',
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transport_companies_owner_idx on public.transport_companies (owner_user_id);
create index if not exists transport_companies_code_idx on public.transport_companies (company_code);
create index if not exists transport_company_fleets_company_idx on public.transport_company_fleets (company_id, updated_at desc);
create index if not exists transport_company_fleets_type_idx on public.transport_company_fleets (fleet_type, service_category);
create index if not exists transport_company_invites_company_idx on public.transport_company_operator_invites (company_id, status, created_at desc);
create index if not exists transport_company_invites_operator_user_idx on public.transport_company_operator_invites (operator_user_id, status, created_at desc);
create index if not exists transport_company_invites_public_id_idx on public.transport_company_operator_invites (operator_public_id);
create index if not exists transport_company_members_company_idx on public.transport_company_members (company_id, status, role);
create index if not exists transport_company_members_user_idx on public.transport_company_members (user_id, status);
create index if not exists transport_company_activities_company_idx on public.transport_company_activities (company_id, created_at desc);

drop trigger if exists transport_companies_set_updated_at on public.transport_companies;
create trigger transport_companies_set_updated_at
before update on public.transport_companies
for each row execute function public.transport_company_set_updated_at();

drop trigger if exists transport_company_fleets_set_updated_at on public.transport_company_fleets;
create trigger transport_company_fleets_set_updated_at
before update on public.transport_company_fleets
for each row execute function public.transport_company_set_updated_at();

drop trigger if exists transport_company_invites_set_updated_at on public.transport_company_operator_invites;
create trigger transport_company_invites_set_updated_at
before update on public.transport_company_operator_invites
for each row execute function public.transport_company_set_updated_at();

drop trigger if exists transport_company_members_set_updated_at on public.transport_company_members;
create trigger transport_company_members_set_updated_at
before update on public.transport_company_members
for each row execute function public.transport_company_set_updated_at();

alter table public.transport_companies enable row level security;
alter table public.transport_company_fleets enable row level security;
alter table public.transport_company_operator_invites enable row level security;
alter table public.transport_company_members enable row level security;
alter table public.transport_company_activities enable row level security;

alter table public.transport_companies force row level security;
alter table public.transport_company_fleets force row level security;
alter table public.transport_company_operator_invites force row level security;
alter table public.transport_company_members force row level security;
alter table public.transport_company_activities force row level security;

revoke all on table public.transport_companies from anon;
revoke all on table public.transport_company_fleets from anon;
revoke all on table public.transport_company_operator_invites from anon;
revoke all on table public.transport_company_members from anon;
revoke all on table public.transport_company_activities from anon;

grant select, insert, update, delete on table public.transport_companies to authenticated;
grant select, insert, update, delete on table public.transport_company_fleets to authenticated;
grant select, insert, update, delete on table public.transport_company_operator_invites to authenticated;
grant select, insert, update, delete on table public.transport_company_members to authenticated;
grant select, insert on table public.transport_company_activities to authenticated;

drop policy if exists "company owners can manage own company" on public.transport_companies;
create policy "company owners can manage own company"
on public.transport_companies
for all
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "active members can read company" on public.transport_companies;
create policy "active members can read company"
on public.transport_companies
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_company_members member
    where member.company_id = transport_companies.id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
);

drop policy if exists "company owners can manage fleets" on public.transport_company_fleets;
create policy "company owners can manage fleets"
on public.transport_company_fleets
for all
to authenticated
using (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_fleets.company_id
      and company.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_fleets.company_id
      and company.owner_user_id = auth.uid()
  )
);

drop policy if exists "company members can read fleets" on public.transport_company_fleets;
create policy "company members can read fleets"
on public.transport_company_fleets
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_company_members member
    where member.company_id = transport_company_fleets.company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
);

drop policy if exists "invited operators can read assigned fleet" on public.transport_company_fleets;
create policy "invited operators can read assigned fleet"
on public.transport_company_fleets
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.company_fleet_id = transport_company_fleets.id
      and (
        invite.operator_user_id = auth.uid()
        or exists (
          select 1
          from public.transport_operators operator
          where operator.id = invite.operator_id
            and operator.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "company owners can manage invites" on public.transport_company_operator_invites;
create policy "company owners can manage invites"
on public.transport_company_operator_invites
for all
to authenticated
using (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_operator_invites.company_id
      and company.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_operator_invites.company_id
      and company.owner_user_id = auth.uid()
  )
);

drop policy if exists "invited operators can read own invites" on public.transport_company_operator_invites;
create policy "invited operators can read own invites"
on public.transport_company_operator_invites
for select
to authenticated
using (
  operator_user_id = auth.uid()
  or exists (
    select 1
    from public.transport_operators operator
    where operator.id = transport_company_operator_invites.operator_id
      and operator.user_id = auth.uid()
  )
);

drop policy if exists "invited operators can respond to own invites" on public.transport_company_operator_invites;
create policy "invited operators can respond to own invites"
on public.transport_company_operator_invites
for update
to authenticated
using (
  operator_user_id = auth.uid()
  or exists (
    select 1
    from public.transport_operators operator
    where operator.id = transport_company_operator_invites.operator_id
      and operator.user_id = auth.uid()
  )
)
with check (
  operator_user_id = auth.uid()
  or exists (
    select 1
    from public.transport_operators operator
    where operator.id = transport_company_operator_invites.operator_id
      and operator.user_id = auth.uid()
  )
);

drop policy if exists "company owners can manage members" on public.transport_company_members;
create policy "company owners can manage members"
on public.transport_company_members
for all
to authenticated
using (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_members.company_id
      and company.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_members.company_id
      and company.owner_user_id = auth.uid()
  )
);

drop policy if exists "members can read own membership" on public.transport_company_members;
create policy "members can read own membership"
on public.transport_company_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "company owners can read activities" on public.transport_company_activities;
create policy "company owners can read activities"
on public.transport_company_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_activities.company_id
      and company.owner_user_id = auth.uid()
  )
);

drop policy if exists "company members can read activities" on public.transport_company_activities;
create policy "company members can read activities"
on public.transport_company_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_company_members member
    where member.company_id = transport_company_activities.company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
);

drop policy if exists "company owners can create activities" on public.transport_company_activities;
create policy "company owners can create activities"
on public.transport_company_activities
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and exists (
    select 1
    from public.transport_companies company
    where company.id = transport_company_activities.company_id
      and company.owner_user_id = auth.uid()
  )
);

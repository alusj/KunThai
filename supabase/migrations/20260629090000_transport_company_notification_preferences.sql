-- Per-user Fleet HQ notification choices. Preferences change delivery/display,
-- never the underlying immutable company activity log.

create table if not exists public.transport_company_notification_preferences (
  company_id uuid not null references public.transport_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (company_id, user_id)
);

alter table public.transport_company_notification_preferences enable row level security;
alter table public.transport_company_notification_preferences force row level security;

revoke all on table public.transport_company_notification_preferences from anon;
grant select, insert, update, delete on table public.transport_company_notification_preferences to authenticated;

drop policy if exists "company staff manage own notification preferences" on public.transport_company_notification_preferences;
create policy "company staff manage own notification preferences"
on public.transport_company_notification_preferences
for all
to authenticated
using (
  user_id = auth.uid()
  and (
    exists (
      select 1 from public.transport_companies company
      where company.id = company_id and company.owner_user_id = auth.uid()
    )
    or public.transport_company_user_has_permission(company_id, 'view_company_activity', auth.uid())
  )
)
with check (
  user_id = auth.uid()
  and (
    exists (
      select 1 from public.transport_companies company
      where company.id = company_id and company.owner_user_id = auth.uid()
    )
    or public.transport_company_user_has_permission(company_id, 'view_company_activity', auth.uid())
  )
);


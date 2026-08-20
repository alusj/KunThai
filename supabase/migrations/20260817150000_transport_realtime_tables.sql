-- Enable Postgres realtime for the remaining transport tables the app already
-- subscribes to (postgres_changes) but that were never added to the
-- supabase_realtime publication. Without this, live operator/company/fleet and
-- nearby-operator-location updates never reach the clients that subscribe to
-- them (transportCompanyService, transportFleetService, nearbyAreaLiveService).
-- transport_trips and transport_company_operator_invites are already published
-- by earlier migrations. Idempotent per table, so re-running (or a table already
-- enabled from the dashboard) is a no-op.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'transport_companies',
    'transport_company_activities',
    'transport_company_fleets',
    'transport_company_members',
    'transport_fleets',
    'transport_operator_locations'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach v_table in array v_tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = v_table)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

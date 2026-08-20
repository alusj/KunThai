-- Enable Postgres realtime for transport_trips.
--
-- The app already subscribes to postgres_changes on public.transport_trips in
-- several places (operator dashboard via subscribeOperatorTrips, the passenger
-- live-trip card, and the company workspace), but the table was never added to
-- the supabase_realtime publication. Those subscriptions therefore never fired,
-- so the operator dashboard never refreshed on a new booking or on live trip
-- progress, and the live-trip metric distance never updated while viewing the
-- dashboard. Adding the table to the publication makes the existing
-- subscriptions deliver inserts/updates (still filtered by RLS), so bookings,
-- status changes, and distance progress reflect live.
--
-- Idempotent: only adds the table if it is not already a publication member, so
-- re-running (or a project that already enabled realtime from the dashboard) is
-- a no-op.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'transport_trips'
     ) then
    alter publication supabase_realtime add table public.transport_trips;
  end if;
end;
$$;

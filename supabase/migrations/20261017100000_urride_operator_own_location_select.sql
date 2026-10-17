-- UrRide: an operator can always read their own live-location row, 2026-10-17.
--
-- Why: the only SELECT policy on public.transport_operator_locations is the
-- passenger one ("Anyone can view active nearby operators": status online or
-- busy, seen within 10 minutes). Postgres also applies SELECT policies to the
-- existing row of an INSERT ... ON CONFLICT DO UPDATE and to the rows an
-- UPDATE ... WHERE reads. So once an operator's row went stale (more than
-- 10 minutes old) or was marked offline, every later write from that operator
-- failed:
--   * the app's upsert (operatorLiveLocationService.publishRow) was rejected
--     with 42501 "new row violates row-level security policy (USING
--     expression)", so the operator never became visible again;
--   * going offline (markOffline) matched 0 rows, silently.
-- The operator dashboard then said "Not visible to passengers" while the
-- Active switch and the Android "you're online" notification said online.
--
-- Fix: a second, owner-only SELECT policy. Permissive policies are OR-ed, so
-- passengers still only see online/busy operators seen within 10 minutes; an
-- operator additionally sees (and so can upsert and update) their own row.
-- No table, column, row or other policy is changed. Re-runnable.

begin;

drop policy if exists "Operators can view own live location" on public.transport_operator_locations;
create policy "Operators can view own live location"
  on public.transport_operator_locations
  for select
  to authenticated
  using (operator_id = auth.uid());

commit;

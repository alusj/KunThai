-- Keep renamed Fleet HQ policies safe to apply after an earlier/manual run.

drop policy if exists "company members can read fleets" on public.transport_company_fleets;
drop policy if exists "delegated members can read company fleets" on public.transport_company_fleets;
create policy "delegated members can read company fleets"
on public.transport_company_fleets
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'view_company_hq', auth.uid()));

drop policy if exists "company members can read activities" on public.transport_company_activities;
drop policy if exists "delegated members can read company activities" on public.transport_company_activities;
create policy "delegated members can read company activities"
on public.transport_company_activities
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'view_company_activity', auth.uid()));

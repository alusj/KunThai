-- Dispatchers need the active operator roster to assemble the company booking queue,
-- without receiving operator documents, earnings, or account mutation rights.

drop policy if exists "company booking viewers can read active operator roster" on public.transport_company_members;
create policy "company booking viewers can read active operator roster"
on public.transport_company_members
for select
to authenticated
using (
  status = 'active'
  and public.transport_company_user_has_permission(company_id, 'view_all_bookings', auth.uid())
);

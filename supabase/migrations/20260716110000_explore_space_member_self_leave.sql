-- Allow a Space member to remove their own membership without team-manager help.

drop policy if exists "space members leave their own team" on public.explore_space_members;
create policy "space members leave their own team"
on public.explore_space_members for update to authenticated
using (
  user_id = auth.uid()
  and status in ('active', 'pending')
  and role <> 'owner'
)
with check (
  user_id = auth.uid()
  and status = 'removed'
  and role <> 'owner'
);

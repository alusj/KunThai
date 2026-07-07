-- Comment reports are written with an upsert, so re-reporting the same
-- comment takes the UPDATE path. Without an UPDATE policy that fails with
-- "new row violates row-level security policy (USING expression)".
drop policy if exists users_update_own_comment_reports on public.explore_comment_reports;
create policy users_update_own_comment_reports
  on public.explore_comment_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

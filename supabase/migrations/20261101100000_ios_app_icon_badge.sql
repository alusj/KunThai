-- iPhone app-icon badge (2026-11-01).
--
-- iOS shows no notification icons in the status bar; its equivalent of
-- Android's icons is the red number on the app icon. APNs only sets it when
-- the push carries `badge`, so send-native-push now sends the number of
-- pushes this person received since they last opened KunThai. The app calls
-- reset_push_badge() whenever it comes to the front (pushService.js).

create table if not exists public.push_badge_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null default now()
);

-- Read and written only by reset_push_badge() and the push function
-- (service role); no direct client access.
alter table public.push_badge_resets enable row level security;

create or replace function public.reset_push_badge()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_badge_resets (user_id, reset_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set reset_at = excluded.reset_at;
$$;

revoke all on function public.reset_push_badge() from public, anon;
grant execute on function public.reset_push_badge() to authenticated;

-- The push function counts a person's recent pushes for the badge.
create index if not exists push_outbox_user_created_idx on public.push_outbox (user_id, created_at);

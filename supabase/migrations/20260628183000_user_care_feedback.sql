-- Private user feedback for KunThai "Your Voice".
-- This is intentionally separate from public Explore posts and reuses the
-- existing scoped admin support permissions when that foundation is present.

create extension if not exists pgcrypto;

create table if not exists public.user_care_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('idea','bug','complaint','safety','other')),
  category text not null check (category in ('explore','urfeed','swip','marketplace','transport','payments','account','other')),
  title text not null check (char_length(title) between 1 and 120),
  message text check (message is null or char_length(message) <= 2000),
  voice_note_url text,
  screenshot_url text,
  current_screen text,
  status text not null default 'submitted' check (status in ('submitted','under_review','planned','fixed','closed')),
  admin_reply text,
  admin_seen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(message, '')), '') is not null or voice_note_url is not null or screenshot_url is not null)
);

create index if not exists user_care_feedback_user_created_idx
  on public.user_care_feedback(user_id, created_at desc);
create index if not exists user_care_feedback_admin_queue_idx
  on public.user_care_feedback(status, feedback_type, category, created_at desc);

create or replace function public.user_care_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_care_feedback_set_updated_at on public.user_care_feedback;
create trigger user_care_feedback_set_updated_at
before update on public.user_care_feedback
for each row execute function public.user_care_set_updated_at();

create or replace function public.user_care_guard_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.admin_has_permission(text,text,uuid)') is not null
     and public.admin_has_permission('support.manage', 'explore', auth.uid()) then
    return new;
  end if;

  if old.user_id <> auth.uid() or old.admin_seen then
    raise exception 'This feedback can no longer be edited';
  end if;

  if new.user_id <> old.user_id
     or new.feedback_type <> old.feedback_type
     or new.category <> old.category
     or new.voice_note_url is distinct from old.voice_note_url
     or new.screenshot_url is distinct from old.screenshot_url
     or new.current_screen is distinct from old.current_screen
     or new.status <> old.status
     or new.admin_reply is distinct from old.admin_reply
     or new.admin_seen <> old.admin_seen
     or new.created_at <> old.created_at then
    raise exception 'Only the title and message can be edited before review';
  end if;

  return new;
end;
$$;

drop trigger if exists user_care_feedback_guard_user_update on public.user_care_feedback;
create trigger user_care_feedback_guard_user_update
before update on public.user_care_feedback
for each row execute function public.user_care_guard_user_update();

alter table public.user_care_feedback enable row level security;

drop policy if exists "Users create own user care feedback" on public.user_care_feedback;
create policy "Users create own user care feedback"
on public.user_care_feedback for insert to authenticated
with check (user_id = auth.uid() and status = 'submitted' and admin_reply is null and admin_seen = false);

drop policy if exists "Users read own user care feedback" on public.user_care_feedback;
create policy "Users read own user care feedback"
on public.user_care_feedback for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users edit unseen user care feedback" on public.user_care_feedback;
create policy "Users edit unseen user care feedback"
on public.user_care_feedback for update to authenticated
using (user_id = auth.uid() and admin_seen = false)
with check (user_id = auth.uid());

drop policy if exists "Support admins read user care feedback" on public.user_care_feedback;
create policy "Support admins read user care feedback"
on public.user_care_feedback for select to authenticated
using (public.admin_has_permission('support.view', 'explore'));

drop policy if exists "Support admins manage user care feedback" on public.user_care_feedback;
create policy "Support admins manage user care feedback"
on public.user_care_feedback for update to authenticated
using (public.admin_has_permission('support.manage', 'explore'))
with check (public.admin_has_permission('support.manage', 'explore'));

revoke all on table public.user_care_feedback from anon;
grant select, insert, update on table public.user_care_feedback to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-care-voice-notes', 'user-care-voice-notes', false, 5242880, array['audio/webm','audio/ogg','audio/mp4','audio/mpeg']),
  ('user-care-screenshots', 'user-care-screenshots', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own user care voice notes" on storage.objects;
create policy "Users upload own user care voice notes"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-care-voice-notes' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Users read own user care voice notes" on storage.objects;
create policy "Users read own user care voice notes"
on storage.objects for select to authenticated
using (bucket_id = 'user-care-voice-notes' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Users remove own user care voice notes" on storage.objects;
create policy "Users remove own user care voice notes"
on storage.objects for delete to authenticated
using (bucket_id = 'user-care-voice-notes' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Users upload own user care screenshots" on storage.objects;
create policy "Users upload own user care screenshots"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-care-screenshots' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Users read own user care screenshots" on storage.objects;
create policy "Users read own user care screenshots"
on storage.objects for select to authenticated
using (bucket_id = 'user-care-screenshots' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Users remove own user care screenshots" on storage.objects;
create policy "Users remove own user care screenshots"
on storage.objects for delete to authenticated
using (bucket_id = 'user-care-screenshots' and (storage.foldername(name))[1] = 'user-care' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "Support admins read user care attachments" on storage.objects;
create policy "Support admins read user care attachments"
on storage.objects for select to authenticated
using (bucket_id in ('user-care-voice-notes','user-care-screenshots') and public.admin_has_permission('support.view', 'explore'));

-- Feed new and updated feedback into the existing admin Support queue without
-- creating a second admin navigation system.
create or replace function public.admin_intake_user_care_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.admin_upsert_source_case(jsonb,text,text,text,text)') is not null then
    perform public.admin_upsert_source_case(
      to_jsonb(new) || jsonb_build_object(
        'description', coalesce(new.message, 'Attachment supplied with this feedback.'),
        'priority', case when new.feedback_type = 'safety' then 'urgent' else 'normal' end
      ),
      'user_care_feedback',
      'explore',
      'support',
      'user_voice'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists admin_intake_user_care_feedback on public.user_care_feedback;
create trigger admin_intake_user_care_feedback
after insert or update on public.user_care_feedback
for each row execute function public.admin_intake_user_care_feedback();

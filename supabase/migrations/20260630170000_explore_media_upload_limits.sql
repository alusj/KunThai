insert into storage.buckets (id, name, public, file_size_limit)
values ('explore-media', 'explore-media', true, 52428800)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit;

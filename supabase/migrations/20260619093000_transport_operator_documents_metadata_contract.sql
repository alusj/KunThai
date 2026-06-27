alter table if exists public.transport_operator_documents
  add column if not exists file_name text,
  add column if not exists document_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transport_operator_documents
  alter column file_url drop not null;

update public.transport_operator_documents
set
  file_name = coalesce(
    nullif(file_name, ''),
    nullif(regexp_replace(coalesce(file_url, document_url, ''), '^.*/', ''), '')
  ),
  updated_at = coalesce(updated_at, uploaded_at, now())
where file_name is null
   or updated_at is null;

-- Keep buyer catalogs live and remove a legacy verification alias that could
-- be mistaken for an administrator approval.

update public.marketplace_businesses
set verification_status = 'pending', updated_at = now()
where lower(coalesce(verification_status, '')) = 'verify';

do $$
declare
  table_name text;
begin
  foreach table_name in array array['marketplace_products', 'marketplace_businesses'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

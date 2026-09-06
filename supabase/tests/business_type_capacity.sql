-- Run ONLY against an isolated disposable database, with ON_ERROR_STOP enabled.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table public.kunthai_business_plans(surface text, plan_code text);
insert into public.kunthai_business_plans values ('urmall','free'),('urmall','pro'),('urmall','premium');
create table public.marketplace_businesses(id uuid primary key, user_id uuid not null, business_kind text, created_at timestamptz default now());
create table public.kunthai_business_subscriptions(marketplace_business_id uuid, surface text, plan_code text, status text, current_period_end timestamptz);
\ir ../migrations/20260905170000_urmall_business_type_capacity.sql
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000001',auth.uid(),'retail',now());
do $$ begin
  begin
    insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000002',auth.uid(),'vendor',now());
    raise exception 'TEST FAILED: free allowed a second type';
  exception when raise_exception then
    if sqlerrm not like 'Your free plan allows 1%' then raise; end if;
  end;
end $$;
insert into kunthai_business_subscriptions values ('20000000-0000-0000-0000-000000000001','urmall','pro','active',now()+interval '1 day');
insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000002',auth.uid(),'vendor',now());
do $$ begin
  if get_my_urmall_business_type_capacity()->>'plan_code' <> 'pro' then raise exception 'TEST FAILED: highest active plan'; end if;
  begin
    insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000003',auth.uid(),'restaurant',now());
    raise exception 'TEST FAILED: pro allowed a third type';
  exception when raise_exception then
    if sqlerrm not like 'Your pro plan allows 2%' then raise; end if;
  end;
end $$;
update kunthai_business_subscriptions set plan_code='premium';
insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000003',auth.uid(),'restaurant',now());
insert into marketplace_businesses values ('20000000-0000-0000-0000-000000000004',auth.uid(),'property_agent',now());
update kunthai_business_subscriptions set current_period_end=now()-interval '1 second';
do $$ begin
  if get_my_urmall_business_type_capacity()->>'plan_code' <> 'free' then raise exception 'TEST FAILED: expired plan still unlocks types'; end if;
  if (select count(*) from marketplace_businesses) <> 4 then raise exception 'TEST FAILED: existing businesses removed'; end if;
end $$;
update marketplace_businesses set business_kind='retail' where id='20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',false);
do $$ begin
  begin
    update marketplace_businesses set user_id=auth.uid() where id='20000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: editor could take business ownership';
  exception when raise_exception then
    if sqlerrm <> 'Business ownership cannot be changed from a client session.' then raise; end if;
  end;
end $$;
select 'PASS: Free/Pro/Premium creation, expired entitlement, and existing business preservation' as result;

\set ON_ERROR_STOP on
begin;
-- Make this a future-policy expiry (the already-expired rollout path is tested separately).
update public.kunthai_urmall_retention_policy set activated_at = now() - interval '30 days';
insert into public.marketplace_businesses values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Retail test','retail'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Restaurant test','restaurant'),
('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Properties test','property_agent'),
('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','Vendor test','vendor');
insert into public.kunthai_business_subscriptions(id,surface,marketplace_business_id,plan_code,status,current_period_end,payer_user_id)
select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'urmall',('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'pro','active',now() + interval '1 day',('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.marketplace_products(id,business_id,name,status,published_at,created_at)
select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','Product ' || n,case when n <= 12 then 'active' else 'draft' end,
 case when n <= 12 then now() - n * interval '1 hour' else null end,now() - n * interval '1 hour' from generate_series(1,14) n;
insert into public.marketplace_products(id,business_id,name,status,published_at)
select ('50000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000004','Vendor product ' || n,'active',now() - n * interval '1 hour' from generate_series(1,12) n;
insert into public.marketplace_restaurant_menu_items(id,business_id,name,created_at)
select ('60000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000002','Meal ' || n,now() - n * interval '1 hour' from generate_series(1,12) n;
insert into public.marketplace_property_listings(id,business_id,title,created_at)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000003','Property ' || n,now() - n * interval '1 hour' from generate_series(1,12) n;
insert into public.marketplace_orders(product_id,total_amount) values('40000000-0000-4000-8000-000000000011',100);
insert into public.marketplace_business_admins(business_id,user_id,status,responsibilities) values
('10000000-0000-4000-8000-000000000001','99999999-9999-4999-8999-999999999999','accepted','{"addProducts":true}'),
('10000000-0000-4000-8000-000000000004','99999999-9999-4999-8999-999999999998','accepted','{"messageReplies":true}');
update public.kunthai_business_subscriptions set current_period_end=now()-interval '1 hour';
select public.kunthai_renew_subscription_row(id) from public.kunthai_business_subscriptions;
do $$ begin
  if (select count(*) from public.kunthai_urmall_retention_cases where status = 'pending') <> 4 then raise exception 'Expected one case per expired business'; end if;
  if exists(select 1 from public.kunthai_business_subscriptions where plan_code <> 'free') then raise exception 'UrMall must downgrade immediately without grace'; end if;
  if exists(select 1 from public.kunthai_urmall_retention_cases where cardinality(retained_ids) <> 10 or delete_after <> started_at + interval '15 days') then raise exception 'Ten retained items and immutable fifteen days required'; end if;
end $$;
set local role anon;
do $$ begin
  if (select count(*) from public.marketplace_products where business_id='10000000-0000-4000-8000-000000000001') <> 10 then raise exception 'Public retail must show ten'; end if;
  if (select count(*) from public.marketplace_products where business_id='10000000-0000-4000-8000-000000000004') <> 10 then raise exception 'Public vendor must show ten'; end if;
  if (select count(*) from public.marketplace_restaurant_menu_items) <> 10 then raise exception 'Public restaurant must show ten'; end if;
  if (select count(*) from public.marketplace_property_listings) <> 10 then raise exception 'Public property must show ten'; end if;
end $$;
reset role;
select set_config('test.user_id','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare state jsonb; c uuid; ids uuid[]; before_deadline text; begin
  if (select count(*) from public.marketplace_products where business_id='10000000-0000-4000-8000-000000000001') <> 14 then raise exception 'Owner needs access to hidden items during selection'; end if;
  state := public.get_urmall_expiry_retention('10000000-0000-4000-8000-000000000001');
  c := (state -> 'case' ->> 'id')::uuid;
  before_deadline := state -> 'case' ->> 'delete_after';
  ids := array(select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(2,10) n) || array['40000000-0000-4000-8000-000000000012'::uuid];
  state := public.select_urmall_retained_inventory(c,ids);
  if state -> 'case' ->> 'delete_after' <> before_deadline then raise exception 'Selection extended deadline'; end if;
  begin
    perform public.select_urmall_retained_inventory(c,array['40000000-0000-4000-8000-000000000013'::uuid]);
    raise exception 'Draft should never be retained as a published item';
  exception when raise_exception then
    if sqlerrm = 'Draft should never be retained as a published item' then raise; end if;
  end;
end $$;
reset role;
-- Unauthorized user cannot read or alter selection.
select set_config('test.user_id','20000000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$ begin
  begin
    perform public.get_urmall_expiry_retention('10000000-0000-4000-8000-000000000001');
    raise exception 'Unauthorized read succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('test.user_id','99999999-9999-4999-8999-999999999999',true);
set local role authenticated;
do $$ declare state jsonb; ids uuid[]; begin
  state := public.get_urmall_expiry_retention('10000000-0000-4000-8000-000000000001');
  if (state->>'can_select')::boolean is not true then raise exception 'Product admin cannot select retained inventory'; end if;
  ids := array(select value::uuid from jsonb_array_elements_text(state->'case'->'retained_ids'));
  perform public.select_urmall_retained_inventory((state->'case'->>'id')::uuid,ids);
end $$;
reset role;
select set_config('test.user_id','99999999-9999-4999-8999-999999999998',true);
set local role authenticated;
do $$ declare state jsonb; ids uuid[]; begin
  state := public.get_urmall_expiry_retention('10000000-0000-4000-8000-000000000004');
  if (state->>'can_select')::boolean is true or jsonb_array_length(state->'items') <> 0 then raise exception 'Message-only admin received product access'; end if;
  ids := array(select value::uuid from jsonb_array_elements_text(state->'case'->'retained_ids'));
  begin
    perform public.select_urmall_retained_inventory((state->'case'->>'id')::uuid,ids);
    raise exception 'Message-only admin changed retained items';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('test.user_id','',true);
-- Updating a listing's timestamp cannot change the protected snapshot.
update public.marketplace_products set published_at=now()+interval '1 day' where id='40000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
  if exists(select 1 from public.marketplace_products where id='40000000-0000-4000-8000-000000000001') then raise exception 'Editing publish time changed protected selection'; end if;
end $$;
reset role;
-- Upgrading preserves the entire menu, including the excess items.
update public.kunthai_business_subscriptions set plan_code='pro', status='active', current_period_end=now()+interval '30 days'
where marketplace_business_id='10000000-0000-4000-8000-000000000002';
-- Simulate time passage only in the test database.
update public.kunthai_urmall_retention_cases set started_at=now()-interval '16 days', delete_after=now()-interval '1 day';
-- Selecting Free again is not a paid upgrade and cannot cancel the deadline.
update public.kunthai_business_subscriptions set status='active' where marketplace_business_id='10000000-0000-4000-8000-000000000004';
do $$ begin
  if public.process_urmall_expiry_retention() <> 3 then raise exception 'Expected cleanup of three unrenewed businesses'; end if;
  if public.process_urmall_expiry_retention() <> 0 then raise exception 'Cleanup must be idempotent'; end if;
  if (select count(*) from public.marketplace_products where business_id='10000000-0000-4000-8000-000000000001') <> 10 then raise exception 'Retail excess/drafts survived'; end if;
  if not exists(select 1 from public.marketplace_products where id='40000000-0000-4000-8000-000000000012') then raise exception 'Owner chosen item was deleted'; end if;
  if exists(select 1 from public.marketplace_products where id='40000000-0000-4000-8000-000000000001') then raise exception 'Deselected item should be deleted'; end if;
  if (select count(*) from public.marketplace_restaurant_menu_items) <> 12 then raise exception 'Renewed meals were deleted'; end if;
  if (select count(*) from public.marketplace_property_listings) <> 10 then raise exception 'Excess properties survived'; end if;
  if (select count(*) from public.marketplace_products where business_id='10000000-0000-4000-8000-000000000004') <> 10 then raise exception 'Excess vendor products survived'; end if;
  if (select count(*) from public.marketplace_orders where product_id is null and total_amount=100) <> 1 then raise exception 'Order/payment history was lost'; end if;
  begin
    insert into public.marketplace_products(id,business_id,name,status,published_at) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000004','Over-limit vendor item','active',now());
    raise exception 'Vendor eleventh item was allowed';
  exception when raise_exception then
    if sqlerrm not like 'KUNTHAI_PLAN_LIMIT|%' then raise; end if;
  end;
  begin
    insert into public.marketplace_property_listings(id,business_id,title,published) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000003','Eleventh property',true);
    raise exception 'Eleventh property was allowed';
  exception when raise_exception then
    if sqlerrm not like 'KUNTHAI_PLAN_LIMIT|%' then raise; end if;
  end;
end $$;
-- A successful auto-renew never opens a retention case. UrRide retains grace.
insert into public.transport_companies values('80000000-0000-4000-8000-000000000001','Ride test');
insert into public.kunthai_business_subscriptions(id,surface,transport_company_id,plan_code,status,current_period_end)
values('80000000-0000-4000-8000-000000000002','urride','80000000-0000-4000-8000-000000000001','pro','active',now()-interval '1 hour');
do $$ begin
  if public.kunthai_renew_subscription_row('80000000-0000-4000-8000-000000000002') <> 'grace' then raise exception 'UrRide existing grace changed'; end if;
end $$;
select set_config('test.wallet_ready','true',true);
update public.kunthai_business_subscriptions set current_period_end=now()-interval '1 minute', auto_renew=true
where marketplace_business_id='10000000-0000-4000-8000-000000000002';
do $$ begin
  if public.kunthai_renew_subscription_row('30000000-0000-4000-8000-000000000002') <> 'renewed' then raise exception 'Auto renewal failed'; end if;
  if exists(select 1 from public.kunthai_urmall_retention_cases where business_id='10000000-0000-4000-8000-000000000002' and status='pending') then raise exception 'Successful renewal opened a case'; end if;
end $$;
-- A pre-policy expired account receives a fresh full window even if its paid
-- period ended months ago. It is never swept by a retroactive deadline.
update public.kunthai_urmall_retention_policy set activated_at=now();
insert into public.marketplace_businesses values('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','Old expiry','retail');
insert into public.kunthai_business_subscriptions(id,surface,marketplace_business_id,plan_code,status,current_period_end)
values('30000000-0000-4000-8000-000000000005','urmall','10000000-0000-4000-8000-000000000005','pro','active',now()-interval '90 days');
select public.kunthai_renew_subscription_row('30000000-0000-4000-8000-000000000005');
do $$ begin
  if not exists(select 1 from public.kunthai_urmall_retention_cases where business_id='10000000-0000-4000-8000-000000000005' and delete_after=now()+interval '15 days') then raise exception 'Old expiry did not receive fresh notice'; end if;
end $$;
-- Even with the policy already active, a worker returning after a long outage
-- must issue a fresh fifteen-day warning before any deletion.
update public.kunthai_urmall_retention_policy set activated_at=now()-interval '60 days';
insert into public.marketplace_businesses values('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','Delayed scheduler','restaurant');
insert into public.kunthai_business_subscriptions(id,surface,marketplace_business_id,plan_code,status,current_period_end)
values('30000000-0000-4000-8000-000000000006','urmall','10000000-0000-4000-8000-000000000006','pro','active',now()-interval '20 days');
select public.kunthai_renew_subscription_row('30000000-0000-4000-8000-000000000006');
insert into public.marketplace_restaurant_menu_items(id,business_id,name)
select gen_random_uuid(),'10000000-0000-4000-8000-000000000006','New meal ' || n from generate_series(1,10) n;
set local role anon;
do $$ begin
  if (select count(*) from public.marketplace_restaurant_menu_items where business_id='10000000-0000-4000-8000-000000000006') <> 10 then raise exception 'Vacant Free slots remained hidden'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.kunthai_urmall_retention_cases where business_id='10000000-0000-4000-8000-000000000006' and delete_after=now()+interval '15 days') then raise exception 'Delayed notice did not receive full fifteen days'; end if;
  if public.process_urmall_expiry_retention() <> 0 then raise exception 'First delayed notice was deleted immediately'; end if;
  begin
    insert into public.marketplace_restaurant_menu_items(id,business_id,name) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000006','Eleventh meal');
    raise exception 'Eleventh meal was allowed';
  exception when raise_exception then if sqlerrm not like 'KUNTHAI_PLAN_LIMIT|%' then raise; end if;
  end;
end $$;
rollback;
\echo 'PASS: immediate expiry, four business kinds, public RLS ten, owner selection, permissions, immutable deadline, upgrade cancellation, deletion idempotence, order preservation, auto-renewal, and UrRide grace.'

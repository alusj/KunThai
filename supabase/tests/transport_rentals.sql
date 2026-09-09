-- Run after transport_rental_sandbox_setup.sql in a fresh isolated test DB.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.request_transport_rental((select id from transport_company_rentals limit 1),now()+interval '2 days',now()+interval '3 days 1 hour','day','Test customer','+23211111111','first');
select public.request_transport_rental((select id from transport_company_rentals limit 1),now()+interval '2 days 1 hour',now()+interval '3 days','day','Test customer','+23211111111','overlap');
do $$ begin
 if (select total_price from transport_rental_reservations where note='first') <> 200 then raise exception 'Price must ceil whole daily units'; end if;
 if (select count(*) from transport_rental_reservations) <> 2 then raise exception 'Customer must read own requests'; end if;
 begin
   perform public.save_transport_rental('30000000-0000-0000-0000-000000000001','{}');
   raise exception 'Customer unexpectedly saved a rental';
 exception when raise_exception then if sqlerrm='Customer unexpectedly saved a rental' then raise; end if; end;
 begin
   perform public.update_transport_rental_reservation((select id from transport_rental_reservations where note='first'),'confirmed');
   raise exception 'Customer unexpectedly confirmed rental';
 exception when raise_exception then if sqlerrm='Customer unexpectedly confirmed rental' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.update_transport_rental_reservation((select id from transport_rental_reservations where note='first'),'confirmed');
do $$ begin
 begin
   perform public.update_transport_rental_reservation((select id from transport_rental_reservations where note='overlap'),'confirmed');
   raise exception 'Overlapping reservations unexpectedly confirmed';
 exception when exclusion_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 if public.can_manage_transport_rentals('10000000-0000-0000-0000-000000000001') then raise exception 'Fleet manager wrongly allowed'; end if;
 if (select count(*) from transport_rental_reservations) <> 0 then raise exception 'Fleet manager can read private reservations'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
do $$ begin
 if public.can_manage_transport_rentals('10000000-0000-0000-0000-000000000001') then raise exception 'Suspended admin wrongly allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.save_transport_rental('30000000-0000-0000-0000-000000000001','{"title":"Fixture car","currency":"SLE","daily_rate":100,"terms":"Conditions changed later.","status":"hidden"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if (select count(*) from list_transport_rentals()) <> 0 then raise exception 'Hidden rental appeared in discovery'; end if;
 if (select count(*) from list_transport_rentals((select rental_id from transport_rental_reservations where note='first'))) <> 1 then raise exception 'Customer lost access to hidden reserved rental'; end if;
 if (select terms_snapshot from transport_rental_reservations where note='first') <> 'Return with full tank.' then raise exception 'Agreed terms were changed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
do $$ begin
 if (select count(*) from list_transport_rentals()) <> 0 then raise exception 'Unrelated customer can discover hidden rental'; end if;
 if (select count(*) from transport_rental_reservations) <> 0 then raise exception 'Unrelated customer can read reservations'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into transport_company_fleets(id,company_id,service_category,fleet_name) values('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Ride only','Existing operator fleet');
insert into transport_fleets values('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
do $$ begin
 begin
  update transport_company_fleets set service_category='Rental',operator_id=null,operators='[]'::jsonb where id='30000000-0000-0000-0000-000000000002';
  raise exception 'Existing runtime fleet conversion was wrongly allowed';
 exception when raise_exception then
  if sqlerrm not like 'Register a separate Rental fleet.%' then raise; end if;
 end;
 if not exists(select 1 from transport_company_fleets where id='30000000-0000-0000-0000-000000000002' and service_category='Ride only')
   or not exists(select 1 from transport_fleets where id='40000000-0000-0000-0000-000000000002') then raise exception 'Rejected rental conversion changed existing fleet history'; end if;
 begin
  insert into transport_company_operator_invites values(gen_random_uuid(),'30000000-0000-0000-0000-000000000001');
  raise exception 'Rental invite wrongly allowed';
 exception when raise_exception then if sqlerrm='Rental invite wrongly allowed' then raise; end if; end;
 begin
  insert into transport_fleets values(gen_random_uuid(),'30000000-0000-0000-0000-000000000001');
  raise exception 'Runtime rental wrongly allowed';
 exception when raise_exception then if sqlerrm='Runtime rental wrongly allowed' then raise; end if; end;
 if exists(select 1 from platform_notifications where sector<>'transport' or action_target not like 'urride:rental:%') then raise exception 'Rental notification leaked to another bell'; end if;
 if not exists(select 1 from platform_notifications where user_id='00000000-0000-0000-0000-000000000002' and notification_type='urride_rental_confirmed') then raise exception 'Customer confirmation notification missing'; end if;
end $$;
select 'Rental authorization, price rounding, overlap protection, visibility, immutable terms and notification tests passed' as result;

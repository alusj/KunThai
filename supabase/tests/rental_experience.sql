-- Run after rental_experience_setup.sql and transport_rentals.sql.
\set ON_ERROR_STOP on
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into transport_company_fleets(id,company_id,service_category,fleet_name,fleet_code,fleet_type,public_fleet_photos,safety_answers)
values('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Rental','New car','CAR-3','Taxi',
 '[{"label":"Cover photo","url":"https://example.invalid/cover.jpg"}]',
 '{"rentalCurrency":"GHS","rentalTimeNegotiable":true,"rentalDistanceNegotiable":true,"rentalTerms":"Return clean.","rentalPickup":{"address":"Office","latitude":8.4,"longitude":-13.2}}');
do $$ declare r transport_company_rentals; begin
 select * into r from transport_company_rentals where company_fleet_id='30000000-0000-0000-0000-000000000003';
 if r.id is null or r.status <> 'hidden' or r.currency <> 'GHS' or r.terms <> 'Return clean.' or r.photos[1] <> 'https://example.invalid/cover.jpg' then raise exception 'Registration did not create the complete hidden rental'; end if;
 update transport_company_fleets set updated_at=now() where id=r.company_fleet_id;
 if (select count(*) from transport_company_rentals where company_fleet_id=r.company_fleet_id) <> 1 then raise exception 'Duplicate rental created'; end if;
 perform set_transport_rental_availability(r.id,true);
 if not check_transport_rental_availability(r.id,now()+interval '4 days',now()+interval '5 days') then raise exception 'Available dates missing'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select request_transport_rental((select (v->>'id')::uuid from list_transport_rentals() v where v->>'title'='New car'),now()+interval '4 days',now()+interval '5 days','day','Renter','+23211111111','negotiable');
do $$ begin
 if (select total_price from transport_rental_reservations where note='negotiable') <> 0 then raise exception 'Unagreed price was fabricated'; end if;
 begin
  perform set_transport_rental_availability((select rental_id from transport_rental_reservations where note='negotiable'),false);
  raise exception 'Unauthorized availability change';
 exception when raise_exception then if sqlerrm='Unauthorized availability change' then raise; end if; end;
 begin
  perform save_transport_rental_review((select rental_id from transport_rental_reservations where note='negotiable'),5,'Too early');
  raise exception 'Early review accepted';
 exception when raise_exception then if sqlerrm='Early review accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select propose_transport_rental_price((select id from transport_rental_reservations where note='negotiable'),250);
do $$ begin
 begin
  perform update_transport_rental_reservation((select id from transport_rental_reservations where note='negotiable'),'confirmed');
  raise exception 'Unaccepted quote confirmed';
 exception when raise_exception then if sqlerrm='Unaccepted quote confirmed' then raise; end if; end;
 begin
  perform delete_transport_rental_fleet((select rental_id from transport_rental_reservations where note='negotiable'));
  raise exception 'Open rental deleted';
 exception when raise_exception then if sqlerrm='Open rental deleted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 begin
  perform accept_transport_rental_price((select id from transport_rental_reservations where note='negotiable'),200);
  raise exception 'Stale price accepted';
 exception when raise_exception then if sqlerrm='Stale price accepted' then raise; end if; end;
end $$;
select accept_transport_rental_price((select id from transport_rental_reservations where note='negotiable'),250);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select update_transport_rental_reservation((select id from transport_rental_reservations where note='negotiable'),'confirmed');
do $$ declare r uuid; begin
 select rental_id into r from transport_rental_reservations where note='negotiable';
 if check_transport_rental_availability(r,now()+interval '4 days',now()+interval '5 days') then raise exception 'Confirmed dates reported as free'; end if;
 perform set_transport_rental_availability(r,false);
 if exists(select 1 from list_transport_rentals() v where v->>'id'=r::text) then raise exception 'Unavailable rental is discoverable'; end if;
end $$;
select update_transport_rental_reservation((select id from transport_rental_reservations where note='negotiable'),'active');
select update_transport_rental_reservation((select id from transport_rental_reservations where note='negotiable'),'completed');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select save_transport_rental_review((select rental_id from transport_rental_reservations where note='negotiable'),5,'Great vehicle.');
do $$ begin
 if (select count(*) from list_transport_rental_reviews((select rental_id from transport_rental_reservations where note='negotiable'))) <> 1 then raise exception 'Review missing'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select delete_transport_rental_fleet((select rental_id from transport_rental_reservations where note='negotiable'));
do $$ begin
 begin
  perform set_transport_rental_availability((select rental_id from transport_rental_reservations where note='negotiable'),true);
  raise exception 'Deleted rental restored';
 exception when raise_exception then if sqlerrm='Deleted rental restored' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from platform_notifications where notification_type='urride_rental_fleet_updated' and user_id='00000000-0000-0000-0000-000000000002') then raise exception 'Fleet change notification missing'; end if;
 if not exists(select 1 from platform_notifications where notification_type='urride_rental_review' and user_id='00000000-0000-0000-0000-000000000003') then raise exception 'Admin review notification missing'; end if;
 if not exists(select 1 from platform_notifications where body like 'Price proposal:%' and user_id='00000000-0000-0000-0000-000000000002') then raise exception 'Price proposal notification missing'; end if;
 if (select count(*) from transport_rental_reservations where note='negotiable' and status='completed') <> 1 then raise exception 'Deletion erased history'; end if;
end $$;
select 'Rental creation, availability, quotes, notifications, reviews and safe deletion passed' as result;

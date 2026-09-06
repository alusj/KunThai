-- Run after transport_rentals.sql in the isolated fixture database.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.save_transport_rental('30000000-0000-0000-0000-000000000001','{"title":"Fixture car","currency":"SLE","daily_rate":100,"deposit":50,"terms":"Test rental conditions.","photos":["https://example.invalid/car.jpg"],"pickup_address":"Fixture entrance","latitude":8.48,"longitude":-13.2,"status":"available"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.request_transport_rental((select id from transport_company_rentals limit 1),now()+interval '5 days',now()+interval '6 days','day','Concurrent customer','+23211111111','concurrent-A');
select public.request_transport_rental((select id from transport_company_rentals limit 1),now()+interval '5 days',now()+interval '6 days','day','Concurrent customer','+23211111111','concurrent-B');

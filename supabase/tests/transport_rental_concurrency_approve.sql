-- Run two separate sessions together with -v note=concurrent-A / concurrent-B.
\set ON_ERROR_STOP on
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select public.update_transport_rental_reservation((select id from transport_rental_reservations where note=:'note'),'confirmed');
select pg_sleep(2);
commit;

-- Run only in the disposable fleet_type_test database.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fleet_type_test' then
    raise exception 'This fixture requires the disposable fleet_type_test database.';
  end if;
end $$;
create table public.transport_company_fleets (
  fleet_type text not null,
  service_category text not null,
  constraint transport_company_fleets_type_check
    check (fleet_type in ('Motorbike', 'Tricycle', 'Taxi', 'Van'))
);
insert into public.transport_company_fleets values ('Taxi', 'Ride only');
\ir ../migrations/20260908140000_company_fleet_vehicle_type.sql
insert into public.transport_company_fleets values
  ('Vehicle / Car', 'Rental'), ('Vehicle / Car', 'Ride only'),
  ('Motorbike', 'Delivery only'), ('Tricycle', 'Ride only'), ('Van', 'Rental');
do $$ begin
  if (select count(*) from public.transport_company_fleets) <> 6 then
    raise exception 'Existing or new supported fleet types were not saved.';
  end if;
  begin
    insert into public.transport_company_fleets values ('Unsupported vehicle', 'Rental');
    raise exception 'Unsupported fleet type was accepted.';
  exception when check_violation then null;
  end;
end $$;
select 'PASS: rental cars, existing fleet types, and invalid type rejection';

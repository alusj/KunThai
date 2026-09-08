-- Match the company form's general car option, including self-drive rentals.
begin;
alter table public.transport_company_fleets
  drop constraint if exists transport_company_fleets_type_check;
alter table public.transport_company_fleets
  add constraint transport_company_fleets_type_check
  check (fleet_type in ('Motorbike', 'Tricycle', 'Taxi', 'Van', 'Vehicle / Car'));
commit;

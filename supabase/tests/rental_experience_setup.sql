-- Run only in an empty, isolated PostgreSQL database.
\set ON_ERROR_STOP on
\ir transport_rental_sandbox_setup.sql
alter table transport_companies add address text, add latitude numeric, add longitude numeric;
alter table transport_company_fleets add fleet_code text, add fleet_type text, add make text, add model text,
 add manufacture_year integer, add color text, add home_base_location text, add price_per_hour numeric,
 add price_per_km numeric, add safety_answers jsonb default '{}', add public_fleet_photos jsonb default '[]',
 add updated_at timestamptz default now();
create table kunthai_document_requirements(surface text, inline_note text, updated_at timestamptz);
\ir ../migrations/20260906123000_urride_rental_pricing_and_document_copy.sql
\ir ../migrations/20260909120000_rental_fleet_experience.sql

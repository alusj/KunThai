create extension if not exists pgcrypto;

do $$ begin
  create type transport_operator_alert_type as enum (
    'passenger_waiting',
    'verification',
    'payment',
    'review',
    'system'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type transport_operator_alert_status as enum ('unread', 'read', 'archived');
exception
  when duplicate_object then null;
end $$;

alter table transport_operators
  add column if not exists wallet_balance numeric(12, 2) not null default 0,
  add column if not exists pending_payout numeric(12, 2) not null default 0;

alter table transport_fleets
  add column if not exists accepts_ride boolean not null default true,
  add column if not exists accepts_delivery boolean not null default false,
  add column if not exists max_distance_km numeric(6, 2),
  add column if not exists operating_hours_start time,
  add column if not exists operating_hours_end time,
  add column if not exists pause_reason text,
  add column if not exists acceptance_rate numeric(5, 2) not null default 0,
  add column if not exists average_response_seconds int not null default 0;

create table if not exists transport_operator_alerts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references transport_operators(id) on delete cascade,
  fleet_id uuid references transport_fleets(id) on delete cascade,
  alert_type transport_operator_alert_type not null default 'system',
  status transport_operator_alert_status not null default 'unread',
  title text not null,
  body text,
  action_label text,
  action_target text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists transport_operator_reviews (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references transport_operators(id) on delete cascade,
  fleet_id uuid references transport_fleets(id) on delete cascade,
  trip_id uuid references transport_trips(id) on delete set null,
  passenger_id uuid references auth.users(id) on delete set null,
  passenger_name text,
  rating int not null check (rating between 1 and 5),
  review_text text,
  response_text text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists transport_operator_transactions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references transport_operators(id) on delete cascade,
  fleet_id uuid references transport_fleets(id) on delete set null,
  trip_id uuid references transport_trips(id) on delete set null,
  transaction_type text not null check (transaction_type in ('trip_earning', 'cash_in', 'cash_out', 'payout', 'adjustment')),
  amount numeric(12, 2) not null,
  currency text not null default 'SLE',
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists transport_operator_alerts_operator_status_idx
  on transport_operator_alerts (operator_id, status, created_at desc);

create index if not exists transport_operator_reviews_operator_idx
  on transport_operator_reviews (operator_id, created_at desc);

create index if not exists transport_operator_transactions_operator_idx
  on transport_operator_transactions (operator_id, created_at desc);

create index if not exists transport_trips_fleet_status_idx
  on transport_trips (fleet_id, status, created_at desc);

alter table transport_operator_alerts enable row level security;
alter table transport_operator_reviews enable row level security;
alter table transport_operator_transactions enable row level security;

drop policy if exists "operators can manage own fleets" on transport_fleets;
create policy "operators can manage own fleets"
  on transport_fleets for all
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_fleets.operator_id
        and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from transport_operators o
      where o.id = transport_fleets.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can insert own profile" on transport_operators;
create policy "operators can insert own profile"
  on transport_operators for insert
  with check (auth.uid() = user_id);

drop policy if exists "operators can update own profile" on transport_operators;
create policy "operators can update own profile"
  on transport_operators for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "operators can read own alerts" on transport_operator_alerts;
create policy "operators can read own alerts"
  on transport_operator_alerts for select
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_operator_alerts.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can update own alerts" on transport_operator_alerts;
create policy "operators can update own alerts"
  on transport_operator_alerts for update
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_operator_alerts.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can read own reviews" on transport_operator_reviews;
create policy "operators can read own reviews"
  on transport_operator_reviews for select
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_operator_reviews.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can respond to own reviews" on transport_operator_reviews;
create policy "operators can respond to own reviews"
  on transport_operator_reviews for update
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_operator_reviews.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can read own transactions" on transport_operator_transactions;
create policy "operators can read own transactions"
  on transport_operator_transactions for select
  using (
    exists (
      select 1 from transport_operators o
      where o.id = transport_operator_transactions.operator_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "operators can read assigned trips" on transport_trips;
create policy "operators can read assigned trips"
  on transport_trips for select
  using (
    exists (
      select 1
      from transport_fleets f
      join transport_operators o on o.id = f.operator_id
      where f.id = transport_trips.fleet_id
        and o.user_id = auth.uid()
    )
  );

create or replace view transport_operator_dashboard_summary as
select
  o.id as operator_id,
  f.id as fleet_id,
  count(t.id) filter (
    where t.created_at >= date_trunc('day', now())
      and t.status in ('pending_confirmation', 'waiting_operator', 'requested')
  ) as waiting_passengers,
  count(t.id) filter (
    where t.created_at >= date_trunc('day', now())
      and t.status in ('completed')
  ) as trips_today,
  coalesce(sum(t.fare_amount) filter (
    where t.created_at >= date_trunc('day', now())
      and t.status in ('completed')
  ), 0) as earnings_today,
  f.acceptance_rate,
  f.average_response_seconds,
  coalesce(avg(r.rating), f.rating, 0) as average_rating,
  count(r.id) as review_count
from transport_operators o
left join transport_fleets f on f.operator_id = o.id
left join transport_trips t on t.fleet_id = f.id
left join transport_operator_reviews r on r.fleet_id = f.id
group by o.id, f.id, f.acceptance_rate, f.average_response_seconds, f.rating;

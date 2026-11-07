-- Optional front picture (gate, entrance, house front) on UrMall orders and
-- UrRide bookings, like the one saved places and delivery addresses carry.
--
-- Kept out of marketplace_orders / transport_trips on purpose: those rows are
-- loaded in lists (seller orders, operator requests) and a picture is a
-- ~40-90 KB data URL. Here it is loaded only when an order or booking is
-- opened.
--
-- An open (broadcast) booking is keyed by its open_booking_id, so operators
-- reached in a later wave (new trip rows) see the same picture.
--
-- Who can read it: exactly who can read the order or trip it belongs to (the
-- policies below look the parent row up under the reader's own RLS). Only the
-- buyer / passenger who placed it can add, change or remove it. Safe to re-run.

begin;

create table if not exists public.kunthai_front_pictures (
  kind text not null check (kind in ('marketplace_order', 'transport_trip', 'transport_open_booking')),
  ref_id uuid not null,
  picture text not null check (picture like 'data:image/%' and char_length(picture) <= 600000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (kind, ref_id)
);

alter table public.kunthai_front_pictures enable row level security;

revoke all on public.kunthai_front_pictures from anon;
grant select, insert, update, delete on public.kunthai_front_pictures to authenticated;

drop policy if exists "front pictures readable with their order or trip" on public.kunthai_front_pictures;
create policy "front pictures readable with their order or trip"
on public.kunthai_front_pictures for select to authenticated
using (
  (kind = 'marketplace_order' and exists (select 1 from public.marketplace_orders o where o.id = ref_id))
  or (kind = 'transport_trip' and exists (select 1 from public.transport_trips t where t.id = ref_id))
  or (kind = 'transport_open_booking' and exists (select 1 from public.transport_trips t where t.open_booking_id = ref_id))
);

drop policy if exists "buyers and passengers add their front picture" on public.kunthai_front_pictures;
create policy "buyers and passengers add their front picture"
on public.kunthai_front_pictures for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    (kind = 'marketplace_order' and exists (
      select 1 from public.marketplace_orders o where o.id = ref_id and o.buyer_id = auth.uid()
    ))
    or (kind = 'transport_trip' and exists (
      select 1 from public.transport_trips t where t.id = ref_id and t.passenger_id = auth.uid()
    ))
    or (kind = 'transport_open_booking' and exists (
      select 1 from public.transport_trips t where t.open_booking_id = ref_id and t.passenger_id = auth.uid()
    ))
  )
);

drop policy if exists "owners change their front picture" on public.kunthai_front_pictures;
create policy "owners change their front picture"
on public.kunthai_front_pictures for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "owners remove their front picture" on public.kunthai_front_pictures;
create policy "owners remove their front picture"
on public.kunthai_front_pictures for delete to authenticated
using (created_by = auth.uid());

commit;

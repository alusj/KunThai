-- Phone OTP delivery chain (WhatsApp first, SMS fallback).
--
-- Supabase Auth still generates, stores and verifies every phone code. With
-- the Send SMS Hook enabled it hands the code to the `otp-delivery` Edge
-- Function, which delivers that SAME code over the channels listed for the
-- phone's calling code, one after another:
--
--   whatsapp (Meta Cloud API) -> orange_sms (later, supported countries) -> twilio_verify
--
-- The next channel is tried when the previous one fails outright, when
-- WhatsApp reports the message undeliverable, when WhatsApp has not reported
-- it delivered within `whatsapp_wait_seconds`, or when the person taps
-- "Send by SMS" on the code screen (once per code).
--
-- These tables are private to the Edge Function (service role). No client
-- role can read or write them. Safe to re-run.

begin;

-- Which channels each country uses, in order. `calling_code` is the E.164
-- country prefix without "+" (e.g. '232' for Sierra Leone); the longest
-- matching prefix wins and '*' is the default for every other number.
create table if not exists public.kunthai_otp_routes (
  calling_code text primary key check (calling_code = '*' or calling_code ~ '^[0-9]{1,4}$'),
  channels text[] not null check (
    cardinality(channels) > 0
    and channels <@ array['whatsapp', 'orange_sms', 'twilio_verify']::text[]
  ),
  whatsapp_wait_seconds integer not null default 20 check (whatsapp_wait_seconds between 5 and 120),
  is_active boolean not null default true,
  note text,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.kunthai_otp_routes (calling_code, channels, whatsapp_wait_seconds, note)
values ('*', array['whatsapp', 'twilio_verify'], 20, 'Global default: WhatsApp first, Twilio Verify SMS last.')
on conflict (calling_code) do nothing;

-- One row per code Supabase asks us to send. The code itself is kept only
-- AES-GCM encrypted (key lives in the Edge Function secrets) and only while a
-- fallback channel may still need it.
create table if not exists public.kunthai_otp_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  phone text not null,
  calling_code text not null default '*',
  channels text[] not null,
  step integer not null default 0,
  current_channel text,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'delivered', 'exhausted')),
  provider_message_id text,
  code_ciphertext text,
  whatsapp_wait_seconds integer not null default 20,
  manual_fallback_used boolean not null default false,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  step_started_at timestamptz not null default timezone('utc', now()),
  delivered_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists kunthai_otp_deliveries_phone_idx
on public.kunthai_otp_deliveries (phone, created_at desc);

create index if not exists kunthai_otp_deliveries_message_idx
on public.kunthai_otp_deliveries (provider_message_id)
where provider_message_id is not null;

-- Numbers WhatsApp told us are not on WhatsApp (error 131026). They skip the
-- WhatsApp step until `until`, so they get their SMS straight away.
create table if not exists public.kunthai_otp_whatsapp_unreachable (
  phone text primary key,
  reason text,
  until timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.kunthai_otp_routes enable row level security;
alter table public.kunthai_otp_deliveries enable row level security;
alter table public.kunthai_otp_whatsapp_unreachable enable row level security;

revoke all on public.kunthai_otp_routes from anon, authenticated;
revoke all on public.kunthai_otp_deliveries from anon, authenticated;
revoke all on public.kunthai_otp_whatsapp_unreachable from anon, authenticated;

commit;

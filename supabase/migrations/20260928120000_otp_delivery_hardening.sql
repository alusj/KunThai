-- Hardening for the WhatsApp-first OTP chain (builds on 20260926170000_otp_delivery_chain.sql).
--
-- * Codes are stored as a keyed hash (code_hash) for the server-side attempt
--   check; the AES-GCM ciphertext is kept only while an SMS fallback of the
--   SAME code is still possible, then wiped.
-- * Per-code attempt counter (attempts), incremented atomically.
-- * SMS is sent only on a definite WhatsApp failure or when the person asks.
--   The old timer-based fallback (whatsapp_wait_seconds) is no longer used.
-- Safe to re-run.

begin;

alter table public.kunthai_otp_deliveries
  add column if not exists code_hash text,
  add column if not exists attempts integer not null default 0,
  add column if not exists precheck_passed_at timestamptz;

alter table public.kunthai_otp_deliveries
  drop constraint if exists kunthai_otp_deliveries_status_check;
alter table public.kunthai_otp_deliveries
  add constraint kunthai_otp_deliveries_status_check
  check (status in ('sending', 'sent', 'delivered', 'exhausted', 'superseded', 'failed'));

comment on column public.kunthai_otp_routes.whatsapp_wait_seconds is
  'Unused since 2026-09-28: no timer-based SMS. SMS only on a definite WhatsApp failure or on request.';

create or replace function public.kunthai_otp_register_attempt(p_delivery_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.kunthai_otp_deliveries
     set attempts = attempts + 1
   where id = p_delivery_id
  returning attempts;
$$;

revoke all on function public.kunthai_otp_register_attempt(uuid) from public, anon, authenticated;
grant execute on function public.kunthai_otp_register_attempt(uuid) to service_role;

-- Wipe any leftover ciphertext of expired or finished codes (run by cron or by hand).
create or replace function public.kunthai_otp_purge_expired()
returns void
language sql
security definer
set search_path = public
as $$
  update public.kunthai_otp_deliveries
     set code_ciphertext = null
   where code_ciphertext is not null
     and (expires_at < timezone('utc', now()) or status in ('superseded', 'failed', 'exhausted'));
  delete from public.kunthai_otp_deliveries where created_at < timezone('utc', now()) - interval '30 days';
$$;

revoke all on function public.kunthai_otp_purge_expired() from public, anon, authenticated;
grant execute on function public.kunthai_otp_purge_expired() to service_role;

commit;

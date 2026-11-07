-- Hardening for the WhatsApp-first OTP chain (builds on 20260926170000_otp_delivery_chain.sql).
--
-- Ownership (see docs/2026-09-26-whatsapp-otp-setup.md, "Security model"):
-- * Supabase Auth issues an internal 10-digit OTP (sms_otp_length = 10), keeps
--   only its hash in auth.users, and issues the session when it is verified.
--   With the Send SMS Hook on, that code goes to otp-delivery and is NEVER
--   delivered to a person; it is stored here encrypted (auth_code_ciphertext)
--   until otp-delivery uses it once, server-side.
-- * otp-delivery issues the 6-digit code the person receives, stores only its
--   keyed hash (user_code_hash), counts attempts, and enforces send limits.
--   The plaintext is kept encrypted (user_code_ciphertext) only while an SMS of
--   the SAME code may still be sent.
-- * No timer-based SMS: whatsapp_wait_seconds is no longer used.
--
-- Everything here is service-role only. Safe to re-run.

begin;

-- 1. Code storage: rename the old ciphertext column to say whose code it is.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kunthai_otp_deliveries' and column_name = 'code_ciphertext'
  ) then
    alter table public.kunthai_otp_deliveries rename column code_ciphertext to user_code_ciphertext;
  end if;
end $$;

alter table public.kunthai_otp_deliveries
  add column if not exists user_code_ciphertext text,
  add column if not exists user_code_hash text,
  add column if not exists auth_code_ciphertext text,
  add column if not exists attempts integer not null default 0,
  add column if not exists sms_mode text,
  add column if not exists twilio_verification_sid text,
  add column if not exists verified_at timestamptz;

alter table public.kunthai_otp_deliveries
  drop constraint if exists kunthai_otp_deliveries_sms_mode_check;
alter table public.kunthai_otp_deliveries
  add constraint kunthai_otp_deliveries_sms_mode_check
  check (sms_mode is null or sms_mode in ('verify_native', 'verify_custom_code', 'messaging'));

-- 2. Lifecycle states.
alter table public.kunthai_otp_deliveries
  drop constraint if exists kunthai_otp_deliveries_status_check;
alter table public.kunthai_otp_deliveries
  add constraint kunthai_otp_deliveries_status_check
  check (status in ('sending', 'sent', 'delivered', 'exhausted', 'superseded', 'failed', 'verified', 'locked'));

-- Finished rows must not keep any code material.
alter table public.kunthai_otp_deliveries
  drop constraint if exists kunthai_otp_deliveries_no_secrets_when_done;
alter table public.kunthai_otp_deliveries
  add constraint kunthai_otp_deliveries_no_secrets_when_done
  check (
    status not in ('superseded', 'failed', 'verified', 'locked')
    or (user_code_ciphertext is null and auth_code_ciphertext is null)
  );

create index if not exists kunthai_otp_deliveries_active_idx
on public.kunthai_otp_deliveries (phone, created_at desc)
where status in ('sending', 'sent', 'delivered', 'exhausted');

comment on column public.kunthai_otp_routes.whatsapp_wait_seconds is
  'Unused since 2026-09-28: no timer-based SMS. SMS only on a definite WhatsApp failure or on request.';
comment on column public.kunthai_otp_deliveries.auth_code_ciphertext is
  'Supabase Auth internal OTP, AES-GCM encrypted with OTP_CODE_KEY. Never delivered; wiped after use.';
comment on column public.kunthai_otp_deliveries.user_code_hash is
  'HMAC-SHA256 of the 6-digit code sent to the person (key derived from OTP_CODE_KEY).';

-- 3. Atomic attempt counter used by otp-delivery /verify.
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

-- 4. Housekeeping: wipe code material of expired rows, drop rows after 30 days.
create or replace function public.kunthai_otp_purge_expired()
returns void
language sql
security definer
set search_path = public
as $$
  update public.kunthai_otp_deliveries
     set user_code_ciphertext = null,
         auth_code_ciphertext = null
   where (user_code_ciphertext is not null or auth_code_ciphertext is not null)
     and expires_at < timezone('utc', now());
  delete from public.kunthai_otp_deliveries
   where created_at < timezone('utc', now()) - interval '30 days';
$$;

revoke all on function public.kunthai_otp_purge_expired() from public, anon, authenticated;
grant execute on function public.kunthai_otp_purge_expired() to service_role;

commit;

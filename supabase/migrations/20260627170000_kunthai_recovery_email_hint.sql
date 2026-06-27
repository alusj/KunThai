-- Gives a user who already supplied a linked phone number a masked email hint.
-- The exact email is still required by find_kunthai_account before recovery.

create or replace function public.get_kunthai_account_email_hint(
  input_phone text,
  input_country text
)
returns table (
  hint_found boolean,
  masked_email text,
  rate_limited boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  requested_phone text := public.normalize_kunthai_phone(input_phone, input_country);
  request_fingerprint_value text := public.kunthai_request_fingerprint();
  requested_phone_hash text := public.kunthai_hash_identity(requested_phone);
  fingerprint_attempts integer := 0;
  phone_attempts integer := 0;
  matched_email text;
begin
  delete from public.kunthai_account_recovery_throttle
  where attempted_at < now() - interval '24 hours';

  select count(*) into fingerprint_attempts
  from public.kunthai_account_recovery_throttle attempts
  where attempts.request_fingerprint = request_fingerprint_value
    and attempts.attempted_at >= now() - interval '15 minutes';

  if requested_phone is not null then
    select count(*) into phone_attempts
    from public.kunthai_account_recovery_throttle attempts
    where attempts.phone_hash = requested_phone_hash
      and attempts.attempted_at >= now() - interval '15 minutes';
  end if;

  if fingerprint_attempts >= 20 or phone_attempts >= 5 then
    insert into public.kunthai_account_lookup_failures (
      request_fingerprint,
      phone_hash,
      actor_user_id,
      failure_reason
    ) values (
      request_fingerprint_value,
      requested_phone_hash,
      auth.uid(),
      'rate_limited'
    );

    return query select false, null::text, true;
    return;
  end if;

  insert into public.kunthai_account_recovery_throttle (
    request_kind,
    request_fingerprint,
    phone_hash,
    actor_user_id
  ) values (
    'email_hint',
    request_fingerprint_value,
    requested_phone_hash,
    auth.uid()
  );

  if requested_phone is null then
    insert into public.kunthai_account_lookup_failures (
      request_fingerprint,
      phone_hash,
      actor_user_id,
      failure_reason
    ) values (
      request_fingerprint_value,
      requested_phone_hash,
      auth.uid(),
      'invalid_input'
    );

    return query select false, null::text, false;
    return;
  end if;

  select identity_record.normalized_email
  into matched_email
  from public.kunthai_account_identities identity_record
  where identity_record.normalized_phone = requested_phone
    and identity_record.normalized_email is not null
  limit 1;

  if matched_email is null then
    insert into public.kunthai_account_lookup_failures (
      request_fingerprint,
      phone_hash,
      actor_user_id,
      failure_reason
    ) values (
      request_fingerprint_value,
      requested_phone_hash,
      auth.uid(),
      'no_match'
    );

    return query select false, null::text, false;
    return;
  end if;

  return query select true, public.kunthai_mask_email(matched_email), false;
end;
$$;

revoke all on function public.get_kunthai_account_email_hint(text, text) from public;
grant execute on function public.get_kunthai_account_email_hint(text, text) to anon, authenticated;

comment on function public.get_kunthai_account_email_hint(text, text) is
  'Returns only a rate-limited masked email hint for an already supplied phone number.';

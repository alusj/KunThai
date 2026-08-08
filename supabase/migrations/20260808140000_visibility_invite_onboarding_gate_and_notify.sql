-- Visibility invite crediting: two changes.
-- 1. The inviter's 5 credits are only awarded once the invited account is FULLY
--    created — i.e. it has completed onboarding and landed on a dashboard
--    (raw_user_meta_data.onboarding_complete = true). Until then the invite
--    stays pending, so a half-finished signup never mints credits. This gate
--    lives in the shared core so both the client RPC and the auth-confirmation
--    trigger respect it.
-- 2. When the credit is granted, the inviter receives an in-app notification
--    naming the account that joined through their link.

create or replace function public.apply_visibility_invite(
  p_invited_user_id uuid,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invited_user auth.users;
  v_link public.visibility_invite_links;
  v_existing public.visibility_invite_events;
  v_event public.visibility_invite_events;
  v_wallet public.visibility_credit_wallets;
  v_verified boolean;
  v_onboarded boolean;
  v_invited_name text;
begin
  if p_invited_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invited_user from auth.users where id = p_invited_user_id;
  if v_invited_user.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_code = '' then
    v_code := upper(btrim(coalesce(v_invited_user.raw_user_meta_data ->> 'visibility_invite_code', '')));
  end if;

  select * into v_existing
  from public.visibility_invite_events
  where invited_user_id = p_invited_user_id
  limit 1;

  if v_existing.status = 'credited' then
    return jsonb_build_object('status', 'already_credited');
  end if;

  if v_code <> '' then
    select * into v_link
    from public.visibility_invite_links
    where code = v_code and status = 'active';
  elsif v_existing.id is not null then
    -- The signup browser lost the code but a pending event already recorded the link.
    select * into v_link
    from public.visibility_invite_links
    where id = v_existing.link_id and status = 'active';
  end if;

  if v_link.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_link.user_id = p_invited_user_id then
    return jsonb_build_object('status', 'self_invite');
  end if;

  if v_invited_user.created_at < v_link.created_at then
    return jsonb_build_object('status', 'ineligible');
  end if;

  if v_existing.id is not null and v_existing.link_id is distinct from v_link.id then
    return jsonb_build_object('status', 'ineligible');
  end if;

  v_verified := v_invited_user.email_confirmed_at is not null
    or v_invited_user.phone_confirmed_at is not null;

  if not v_verified then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, p_invited_user_id, 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_verification');
  end if;

  -- Credit only after the invited account has fully completed onboarding and
  -- landed on a dashboard. Until then, keep the invite pending.
  v_onboarded := lower(coalesce(v_invited_user.raw_user_meta_data ->> 'onboarding_complete', '')) in ('true', 't', '1', 'yes');

  if not v_onboarded then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, p_invited_user_id, 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_onboarding');
  end if;

  insert into public.visibility_invite_events (
    link_id, inviter_user_id, invited_user_id, status, credits_awarded, credited_at
  ) values (
    v_link.id, v_link.user_id, p_invited_user_id, 'credited', v_link.reward_credits, timezone('utc', now())
  )
  on conflict (invited_user_id) do update
    set status = 'credited',
        credits_awarded = excluded.credits_awarded,
        credited_at = coalesce(public.visibility_invite_events.credited_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where public.visibility_invite_events.link_id = excluded.link_id
      and public.visibility_invite_events.status <> 'credited'
  returning * into v_event;

  if v_event.id is null then
    return jsonb_build_object('status', 'already_credited');
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_link.user_id, v_link.reward_credits, v_link.reward_credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_link.user_id, v_link.reward_credits, v_wallet.balance, 'invite_reward', 'platform',
    'visibility_invite_event', v_event.id,
    jsonb_build_object('invitedUserId', p_invited_user_id, 'inviteCode', v_link.code)
  );

  -- Best readable name for the account that joined through the link.
  v_invited_name := coalesce(
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(concat_ws(' ', v_invited_user.raw_user_meta_data ->> 'first_name', v_invited_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(split_part(coalesce(v_invited_user.email, ''), '@', 1)), ''),
    'A new member'
  );

  -- Notify the inviter. Best-effort: a notification failure must never undo the
  -- credit that was already granted above.
  begin
    insert into public.platform_notifications (
      user_id, sector, notification_type, title, body, priority, status
    ) values (
      v_link.user_id,
      'platform',
      'visibility_credit_reward',
      'Visibility Credits earned',
      format(
        'You''ve earned %s Visibility Credits — %s joined KunThai using your invite link.',
        v_link.reward_credits,
        v_invited_name
      ),
      'normal',
      'unread'
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'status', 'credited',
    'creditsAwarded', v_link.reward_credits,
    'inviterUserId', v_link.user_id,
    'invitedName', v_invited_name
  );
end;
$$;

revoke all on function public.apply_visibility_invite(uuid, text) from public, anon, authenticated;

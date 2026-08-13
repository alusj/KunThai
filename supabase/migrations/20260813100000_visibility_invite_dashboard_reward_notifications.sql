-- Complete the Visibility Credits referral lifecycle.
--
-- A referral becomes eligible only after the invited account is verified,
-- finishes onboarding, and selects one of KunThai's three main dashboards.
-- The wallet credit, ledger entry, and both user notifications are committed in
-- one transaction, so a refresh/retry cannot duplicate the five-credit reward.

alter table public.visibility_invite_links
  alter column reward_credits set default 5;

update public.visibility_invite_links
set reward_credits = 5,
    updated_at = timezone('utc', now())
where reward_credits is distinct from 5;

create unique index if not exists platform_notifications_visibility_invite_event_uidx
on public.platform_notifications (user_id, notification_type, action_target)
where notification_type in ('visibility_credit_reward', 'visibility_invite_success')
  and action_target is not null;

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
  v_reward_credits constant integer := 5;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invited_user auth.users;
  v_inviter_user auth.users;
  v_link public.visibility_invite_links;
  v_existing public.visibility_invite_events;
  v_event public.visibility_invite_events;
  v_wallet public.visibility_credit_wallets;
  v_verified boolean;
  v_onboarded boolean;
  v_landing_surface text;
  v_invited_name text;
  v_inviter_name text;
  v_notification_target text;
begin
  if p_invited_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invited_user
  from auth.users
  where id = p_invited_user_id;

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
    return jsonb_build_object(
      'status', 'already_credited',
      'creditsAwarded', v_existing.credits_awarded,
      'inviterUserId', v_existing.inviter_user_id
    );
  end if;

  if v_code <> '' then
    select * into v_link
    from public.visibility_invite_links
    where code = v_code and status = 'active';
  elsif v_existing.id is not null then
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
  v_onboarded := lower(coalesce(v_invited_user.raw_user_meta_data ->> 'onboarding_complete', ''))
    in ('true', 't', '1', 'yes');
  v_landing_surface := lower(btrim(coalesce(v_invited_user.raw_user_meta_data ->> 'primary_surface', '')));

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

  if not v_onboarded or v_landing_surface not in ('explore', 'marketplace', 'transport') then
    insert into public.visibility_invite_events (
      link_id, inviter_user_id, invited_user_id, status, credits_awarded
    ) values (
      v_link.id, v_link.user_id, p_invited_user_id, 'pending', 0
    )
    on conflict (invited_user_id) do update
      set updated_at = timezone('utc', now())
    returning * into v_event;

    return jsonb_build_object('status', 'pending_dashboard_landing');
  end if;

  insert into public.visibility_invite_events (
    link_id, inviter_user_id, invited_user_id, status, credits_awarded, credited_at
  ) values (
    v_link.id, v_link.user_id, p_invited_user_id, 'credited', v_reward_credits, timezone('utc', now())
  )
  on conflict (invited_user_id) do update
    set status = 'credited',
        credits_awarded = v_reward_credits,
        credited_at = coalesce(public.visibility_invite_events.credited_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where public.visibility_invite_events.link_id = excluded.link_id
      and public.visibility_invite_events.status <> 'credited'
  returning * into v_event;

  if v_event.id is null then
    return jsonb_build_object('status', 'already_credited');
  end if;

  select * into v_inviter_user
  from auth.users
  where id = v_link.user_id;

  v_invited_name := coalesce(
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(concat_ws(' ', v_invited_user.raw_user_meta_data ->> 'first_name', v_invited_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(btrim(v_invited_user.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(split_part(coalesce(v_invited_user.email, ''), '@', 1)), ''),
    'A new member'
  );

  v_inviter_name := coalesce(
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(concat_ws(' ', v_inviter_user.raw_user_meta_data ->> 'first_name', v_inviter_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(btrim(v_inviter_user.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(split_part(coalesce(v_inviter_user.email, ''), '@', 1)), ''),
    'Your inviter'
  );

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (v_link.user_id, v_reward_credits, v_reward_credits)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + excluded.balance,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + excluded.lifetime_earned,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, reference_id, metadata
  ) values (
    v_link.user_id,
    v_reward_credits,
    v_wallet.balance,
    'invite_reward',
    'platform',
    'visibility_invite_event',
    v_event.id,
    jsonb_build_object(
      'invitedUserId', p_invited_user_id,
      'invitedName', v_invited_name,
      'inviteCode', v_link.code,
      'landingSurface', v_landing_surface
    )
  );

  v_notification_target := format('visibility-invite:%s', v_event.id);

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status, action_target
  ) values
    (
      v_link.user_id,
      'platform',
      'visibility_credit_reward',
      '5 Visibility Credits earned',
      format(
        'Great news — %s successfully joined KunThai through your invite. 5 Visibility Credits have been added to your balance.',
        v_invited_name
      ),
      'normal',
      'unread',
      v_notification_target
    ),
    (
      p_invited_user_id,
      'platform',
      'visibility_invite_success',
      'Your KunThai invite was successful',
      format(
        '%s earned 5 Visibility Credits when you completed your KunThai setup. Share your own invite link to earn credits when friends successfully join.',
        v_inviter_name
      ),
      'normal',
      'unread',
      v_notification_target
    )
  on conflict do nothing;

  return jsonb_build_object(
    'status', 'credited',
    'creditsAwarded', v_reward_credits,
    'inviterUserId', v_link.user_id,
    'inviterName', v_inviter_name,
    'invitedName', v_invited_name,
    'landingSurface', v_landing_surface
  );
end;
$$;

revoke all on function public.apply_visibility_invite(uuid, text) from public, anon, authenticated;

-- Run the same eligibility check when verification completes or onboarding
-- metadata first records a valid dashboard landing. Authentication itself is
-- never blocked; the client RPC safely retries any transient failure.
create or replace function public.handle_visibility_invite_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
  v_dashboard_ready boolean;
  v_became_verified boolean := false;
  v_became_dashboard_ready boolean := false;
begin
  v_verified := new.email_confirmed_at is not null or new.phone_confirmed_at is not null;
  v_dashboard_ready := lower(coalesce(new.raw_user_meta_data ->> 'onboarding_complete', '')) in ('true', 't', '1', 'yes')
    and lower(btrim(coalesce(new.raw_user_meta_data ->> 'primary_surface', ''))) in ('explore', 'marketplace', 'transport');

  if tg_op = 'INSERT' then
    v_became_verified := v_verified;
    v_became_dashboard_ready := v_dashboard_ready;
  else
    v_became_verified := v_verified
      and coalesce(old.email_confirmed_at, old.phone_confirmed_at) is null;
    v_became_dashboard_ready := v_dashboard_ready
      and not (
        lower(coalesce(old.raw_user_meta_data ->> 'onboarding_complete', '')) in ('true', 't', '1', 'yes')
        and lower(btrim(coalesce(old.raw_user_meta_data ->> 'primary_surface', ''))) in ('explore', 'marketplace', 'transport')
      );
  end if;

  if v_became_verified or v_became_dashboard_ready then
    begin
      perform public.apply_visibility_invite(new.id, new.raw_user_meta_data ->> 'visibility_invite_code');
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists visibility_invite_confirmation on auth.users;
create trigger visibility_invite_confirmation
after insert or update of email_confirmed_at, phone_confirmed_at, raw_user_meta_data on auth.users
for each row execute function public.handle_visibility_invite_confirmation();

-- Backfill the second notification for referral rewards credited before this
-- migration. The unique event key keeps this safe to rerun.
insert into public.platform_notifications (
  user_id, sector, notification_type, title, body, priority, status, action_target
)
select
  event.invited_user_id,
  'platform',
  'visibility_invite_success',
  'Your KunThai invite was successful',
  format(
    '%s earned 5 Visibility Credits when you completed your KunThai setup. Share your own invite link to earn credits when friends successfully join.',
    coalesce(
      nullif(btrim(inviter.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(inviter.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(inviter.raw_user_meta_data ->> 'username'), ''),
      nullif(btrim(split_part(coalesce(inviter.email, ''), '@', 1)), ''),
      'Your inviter'
    )
  ),
  'normal',
  'unread',
  format('visibility-invite:%s', event.id)
from public.visibility_invite_events event
join auth.users inviter on inviter.id = event.inviter_user_id
where event.status = 'credited'
on conflict do nothing;

-- Professional admin user workspace and audited Visibility Credit grants.

insert into public.admin_permissions (permission_key, name, description, permission_group)
values (
  'visibility_credits.manage',
  'Grant Visibility Credits',
  'View Visibility Credit wallets and grant audited non-cash promotional credits.',
  'finance'
)
on conflict (permission_key) do update
set name = excluded.name,
    description = excluded.description,
    permission_group = excluded.permission_group;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, 'visibility_credits.manage'
from public.admin_roles role
where role.role_key in ('super_admin', 'chief_admin', 'operations_lead', 'finance_officer')
on conflict do nothing;

create or replace function public.admin_search_users_v2(
  search_text text default '',
  account_status_filter text default null,
  account_type_filter text default null,
  sort_key text default 'newest',
  result_limit integer default 25,
  result_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  phone text,
  display_name text,
  username text,
  avatar_url text,
  account_type text,
  account_status text,
  status_reason text,
  restricted_sectors text[],
  status_expires_at timestamptz,
  email_verified boolean,
  phone_verified boolean,
  profile_verified boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
stable
set search_path = public, auth
as $$
  with matching_users as (
    select
      users.id as user_id,
      users.email::text as email,
      users.phone::text as phone,
      coalesce(
        profile.display_name,
        users.raw_user_meta_data ->> 'display_name',
        users.raw_user_meta_data ->> 'full_name',
        split_part(users.email, '@', 1)
      )::text as display_name,
      coalesce(profile.username, users.raw_user_meta_data ->> 'username')::text as username,
      coalesce(profile.avatar_url, users.raw_user_meta_data ->> 'avatar_url')::text as avatar_url,
      coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal')::text as account_type,
      coalesce(control.status, 'active')::text as account_status,
      coalesce(control.reason, '')::text as status_reason,
      coalesce(control.restricted_sectors, '{}'::text[]) as restricted_sectors,
      control.expires_at as status_expires_at,
      users.email_confirmed_at is not null as email_verified,
      users.phone_confirmed_at is not null as phone_verified,
      coalesce(profile.verified, false) as profile_verified,
      users.last_sign_in_at,
      users.created_at
    from auth.users users
    left join public.explore_profiles profile on profile.user_id = users.id
    left join public.platform_account_controls control on control.user_id = users.id
    where public.admin_has_permission('users.view')
      and (
        coalesce(btrim(search_text), '') = ''
        or users.email ilike '%' || btrim(search_text) || '%'
        or users.phone ilike '%' || btrim(search_text) || '%'
        or profile.display_name ilike '%' || btrim(search_text) || '%'
        or profile.username ilike '%' || btrim(search_text) || '%'
      )
      and (
        coalesce(btrim(account_status_filter), '') in ('', 'all')
        or coalesce(control.status, 'active') = lower(btrim(account_status_filter))
      )
      and (
        coalesce(btrim(account_type_filter), '') in ('', 'all')
        or coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal') = lower(btrim(account_type_filter))
      )
  ), counted as (
    select matching_users.*, count(*) over () as total_count
    from matching_users
  )
  select *
  from counted
  order by
    case when lower(coalesce(sort_key, 'newest')) = 'oldest' then created_at end asc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'name' then lower(display_name) end asc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'last_active' then last_sign_in_at end desc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'newest' then created_at end desc nulls last,
    created_at desc
  limit greatest(1, least(coalesce(result_limit, 25), 100))
  offset greatest(0, coalesce(result_offset, 0));
$$;

create or replace function public.admin_get_user_workspace(target_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_user jsonb;
  v_wallet jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_cases jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_content jsonb := '[]'::jsonb;
  v_piece jsonb := '[]'::jsonb;
  v_case_count integer := 0;
  v_open_case_count integer := 0;
begin
  if not public.admin_has_permission('users.view') then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'user_id', users.id,
    'email', users.email,
    'phone', users.phone,
    'display_name', coalesce(profile.display_name, users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1)),
    'username', coalesce(profile.username, users.raw_user_meta_data ->> 'username'),
    'avatar_url', coalesce(profile.avatar_url, users.raw_user_meta_data ->> 'avatar_url'),
    'account_type', coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal'),
    'account_status', coalesce(control.status, 'active'),
    'status_reason', coalesce(control.reason, ''),
    'restricted_sectors', coalesce(control.restricted_sectors, '{}'::text[]),
    'status_expires_at', control.expires_at,
    'email_verified', users.email_confirmed_at is not null,
    'phone_verified', users.phone_confirmed_at is not null,
    'profile_verified', coalesce(profile.verified, false),
    'last_sign_in_at', users.last_sign_in_at,
    'created_at', users.created_at
  )
  into v_user
  from auth.users users
  left join public.explore_profiles profile on profile.user_id = users.id
  left join public.platform_account_controls control on control.user_id = users.id
  where users.id = target_user_id;

  if v_user is null then
    raise exception 'User not found';
  end if;

  select coalesce(to_jsonb(wallet), jsonb_build_object(
    'user_id', target_user_id,
    'balance', 0,
    'lifetime_earned', 0,
    'lifetime_spent', 0
  ))
  into v_wallet
  from (select 1) seed
  left join public.visibility_credit_wallets wallet on wallet.user_id = target_user_id;

  select coalesce(jsonb_agg(to_jsonb(transaction) order by transaction.created_at desc), '[]'::jsonb)
  into v_transactions
  from (
    select id, user_id, amount, balance_after, transaction_type, surface,
      reference_type, reference_id, metadata, created_at
    from public.visibility_credit_transactions
    where user_id = target_user_id
    order by created_at desc
    limit 30
  ) transaction;

  select coalesce(jsonb_agg(to_jsonb(user_case) order by user_case.created_at desc), '[]'::jsonb)
  into v_cases
  from (
    select id, case_number, sector, queue, case_type, resource_type, title,
      description, status, priority, subject_user_id, reporter_user_id,
      assignee_user_id, created_at, updated_at
    from public.admin_cases
    where subject_user_id = target_user_id or reporter_user_id = target_user_id
    order by created_at desc
    limit 40
  ) user_case;

  select
    count(*)::integer,
    count(*) filter (where status not in ('resolved', 'closed'))::integer
  into v_case_count, v_open_case_count
  from public.admin_cases
  where subject_user_id = target_user_id or reporter_user_id = target_user_id;

  if public.admin_has_permission('audit.view') then
    select coalesce(jsonb_agg(to_jsonb(log) order by log.created_at desc), '[]'::jsonb)
    into v_audit
    from (
      select id, actor_user_id, actor_role_keys, action_key, sector, resource_type,
        resource_id, case_id, reason, metadata, created_at
      from public.admin_audit_logs
      where (resource_type = 'user' and resource_id = target_user_id)
        or metadata ->> 'targetUserId' = target_user_id::text
        or metadata ->> 'target_user_id' = target_user_id::text
      order by created_at desc
      limit 40
    ) log;
  end if;

  if to_regclass('public.explore_posts') is not null
    and public.admin_has_permission('explore.view', 'explore') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', post.id,
          'surface', 'explore',
          'type', coalesce(post.post_type, 'post'),
          'title', case when post.feed_scope = 'swip' then 'Swip video' else 'Explore post' end,
          'summary', left(coalesce(nullif(post.body, ''), 'Media post'), 280),
          'status', coalesce(post.moderation_status, 'published'),
          'media_url', coalesce(post.image_url, post.video_url),
          'created_at', post.created_at
        ) as entry, post.created_at
        from public.explore_posts post
        where post.user_id = $1
        order by post.created_at desc
        limit 20
      ) rows
    $query$ into v_piece using target_user_id;
    v_content := v_content || coalesce(v_piece, '[]'::jsonb);
  end if;

  if to_regclass('public.marketplace_businesses') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', business.id,
          'surface', 'marketplace',
          'type', 'business',
          'title', business.business_name,
          'summary', left(coalesce(nullif(business.description, ''), concat_ws(', ', business.city, business.country)), 280),
          'status', business.verification_status,
          'media_url', business.logo_url,
          'created_at', business.created_at
        ) as entry, business.created_at
        from public.marketplace_businesses business
        where business.user_id = $1
        order by business.created_at desc
        limit 5
      ) rows
    $query$ into v_piece using target_user_id;
    v_content := v_content || coalesce(v_piece, '[]'::jsonb);
  end if;

  if to_regclass('public.marketplace_products') is not null
    and to_regclass('public.marketplace_businesses') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', product.id,
          'surface', 'marketplace',
          'type', 'product',
          'title', product.name,
          'summary', left(coalesce(nullif(product.description, ''), product.category, 'UrMall product'), 280),
          'status', product.status,
          'media_url', product.main_image_url,
          'created_at', product.created_at
        ) as entry, product.created_at
        from public.marketplace_products product
        left join public.marketplace_businesses business on business.id = product.business_id
        where product.user_id = $1 or business.user_id = $1
        order by product.created_at desc
        limit 20
      ) rows
    $query$ into v_piece using target_user_id;
    v_content := v_content || coalesce(v_piece, '[]'::jsonb);
  end if;

  if to_regclass('public.transport_operators') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', operator.id,
          'surface', 'transport',
          'type', 'operator',
          'title', operator.full_name,
          'summary', concat_ws(' · ', operator.display_code, operator.city),
          'status', operator.verification_status::text,
          'media_url', null,
          'created_at', operator.created_at
        ) as entry, operator.created_at
        from public.transport_operators operator
        where operator.user_id = $1
        order by operator.created_at desc
        limit 5
      ) rows
    $query$ into v_piece using target_user_id;
    v_content := v_content || coalesce(v_piece, '[]'::jsonb);
  end if;

  if to_regclass('public.transport_companies') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', company.id,
          'surface', 'transport',
          'type', 'company',
          'title', company.company_name,
          'summary', concat_ws(' · ', company.company_code, company.city, company.country),
          'status', company.verification_status,
          'media_url', null,
          'created_at', company.created_at
        ) as entry, company.created_at
        from public.transport_companies company
        where company.owner_user_id = $1
        order by company.created_at desc
        limit 5
      ) rows
    $query$ into v_piece using target_user_id;
    v_content := v_content || coalesce(v_piece, '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'user', v_user,
    'wallet', coalesce(v_wallet, '{}'::jsonb),
    'transactions', coalesce(v_transactions, '[]'::jsonb),
    'cases', coalesce(v_cases, '[]'::jsonb),
    'content', coalesce(v_content, '[]'::jsonb),
    'audit', coalesce(v_audit, '[]'::jsonb),
    'summary', jsonb_build_object(
      'content_count', jsonb_array_length(coalesce(v_content, '[]'::jsonb)),
      'case_count', coalesce(v_case_count, 0),
      'open_case_count', coalesce(v_open_case_count, 0)
    )
  );
end;
$$;

create unique index if not exists visibility_credit_transactions_admin_grant_request_uidx
  on public.visibility_credit_transactions (reference_id)
  where transaction_type = 'admin_adjustment'
    and reference_type = 'admin_credit_grant'
    and reference_id is not null;

create or replace function public.admin_grant_visibility_credits(
  target_user_id uuid,
  credit_amount integer,
  grant_reason text,
  grant_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_reason text := btrim(coalesce(grant_reason, ''));
  v_request_id uuid := coalesce(grant_request_id, gen_random_uuid());
  v_previous public.visibility_credit_wallets;
  v_wallet public.visibility_credit_wallets;
  v_transaction public.visibility_credit_transactions;
begin
  if not public.admin_has_permission('visibility_credits.manage')
    or public.admin_authority_level() < 3 then
    raise exception 'Not authorized';
  end if;

  if target_user_id is null or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User not found';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot grant Visibility Credits to your own account';
  end if;

  if coalesce(credit_amount, 0) < 1 or credit_amount > 1000 then
    raise exception 'Credit amount must be between 1 and 1000';
  end if;

  if credit_amount > 100 and not public.admin_has_role(array['super_admin']) then
    raise exception 'Grants above 100 Visibility Credits require a Super Admin';
  end if;

  if length(v_reason) < 12 then
    raise exception 'A specific grant reason of at least 12 characters is required';
  end if;

  select * into v_transaction
  from public.visibility_credit_transactions
  where transaction_type = 'admin_adjustment'
    and reference_type = 'admin_credit_grant'
    and reference_id = v_request_id;

  if v_transaction.id is not null then
    if v_transaction.user_id is distinct from target_user_id then
      raise exception 'Grant request identifier is already in use';
    end if;
    select * into v_wallet from public.visibility_credit_wallets where user_id = target_user_id;
    return jsonb_build_object(
      'status', 'already_granted',
      'amount', v_transaction.amount,
      'wallet', to_jsonb(v_wallet),
      'transaction', to_jsonb(v_transaction)
    );
  end if;

  insert into public.visibility_credit_wallets (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  select * into v_previous
  from public.visibility_credit_wallets
  where user_id = target_user_id
  for update;

  update public.visibility_credit_wallets
  set balance = balance + credit_amount,
      lifetime_earned = lifetime_earned + credit_amount,
      updated_at = timezone('utc', now())
  where user_id = target_user_id
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface,
    reference_type, reference_id, metadata
  ) values (
    target_user_id, credit_amount, v_wallet.balance, 'admin_adjustment', 'platform',
    'admin_credit_grant', v_request_id,
    jsonb_build_object(
      'reason', v_reason,
      'adminGrant', true,
      'grantedBy', auth.uid()
    )
  )
  returning * into v_transaction;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority
  ) values (
    target_user_id,
    'platform',
    'visibility_credit_grant',
    'Visibility Credits added',
    format('%s Visibility Credits were added to your KunThai account. %s', credit_amount, v_reason),
    'normal'
  );

  perform public.admin_log_action(
    'visibility_credit.granted',
    'platform',
    'user',
    target_user_id,
    null,
    v_reason,
    to_jsonb(v_previous),
    to_jsonb(v_wallet),
    jsonb_build_object(
      'amount', credit_amount,
      'transactionId', v_transaction.id,
      'requestId', v_request_id
    )
  );

  return jsonb_build_object(
    'status', 'granted',
    'amount', credit_amount,
    'wallet', to_jsonb(v_wallet),
    'transaction', to_jsonb(v_transaction)
  );
end;
$$;

revoke all on function public.admin_search_users_v2(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_get_user_workspace(uuid) from public, anon;
revoke all on function public.admin_grant_visibility_credits(uuid, integer, text, uuid) from public, anon;

grant execute on function public.admin_search_users_v2(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_user_workspace(uuid) to authenticated;
grant execute on function public.admin_grant_visibility_credits(uuid, integer, text, uuid) to authenticated;

-- A tapped UrMall message notification opens that chat (2026-11-10).
--
-- The route used to name only the screen ("urmall:messages",
-- "urmall:business-messages"), so a tap opened the list of chats. It now
-- also names the chat: the store for a buyer, and the store and buyer for
-- its seller team. Older app versions read only the first two parts and
-- still open the list.

CREATE OR REPLACE FUNCTION public.push_queue_urmall_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid;
  v_business text;
  v_from_seller boolean := lower(coalesce(new.sender_role, '')) = 'seller';
  v_title text;
  v_body text;
  v_route text;
begin
  begin
    select business.user_id, business.business_name into v_owner, v_business
    from public.marketplace_businesses business where business.id = new.business_id;

    v_body := public.push_short_text(coalesce(
      nullif(btrim(coalesce(new.preview, '')), ''),
      case when nullif(new.media_url, '') is not null then 'Sent an attachment' else 'New message' end), 160);

    if v_from_seller then
      v_title := coalesce(nullif(btrim(coalesce(v_business, '')), ''), 'UrMall');
      v_route := 'urmall:messages:' || new.business_id::text;
    else
      v_title := coalesce(nullif(btrim(coalesce(new.buyer_name, '')), ''), 'Customer')
        || coalesce(' · ' || nullif(btrim(coalesce(v_business, '')), ''), '');
      v_route := 'urmall:business-messages:' || new.business_id::text || ':' || new.buyer_id::text;
    end if;

    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    select recipient, public.push_short_text(v_title, 100), v_body, v_route, 'urmall_message',
           'urmall_message:' || new.id::text || ':' || recipient::text
    from (
      select new.buyer_id as recipient where v_from_seller
      union
      select v_owner where not v_from_seller
      union
      select admin.user_id
      from public.marketplace_business_admins admin
      where not v_from_seller
        and admin.business_id = new.business_id
        and admin.status = 'accepted'
        and admin.responsibilities ->> 'messageReplies' = 'true'
    ) recipients
    where recipient is not null
      and (v_from_seller or recipient is distinct from new.buyer_id)
      and public.push_recipient_allows(recipient, 'commerce', null, null, null)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_urmall_message skipped: %', sqlerrm;
  end;
  return new;
end;
$function$;

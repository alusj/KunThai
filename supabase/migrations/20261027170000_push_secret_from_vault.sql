-- send_kunthai_push reads the push-send secret from Vault instead of keeping
-- it in the function body. Apply only after rotating the secret:
--   1. openssl rand -hex 32  -> NEW
--   2. select vault.create_secret('<NEW>', 'kunthai_push_trigger_secret', 'x-push-secret for push-send');
--   3. supabase secrets set PUSH_TRIGGER_SECRET=<NEW>
--   4. apply this file (pushes fail between steps 3 and 4, so run them back to back)

create or replace function public.send_kunthai_push(
  recipient_ids uuid[],
  push_title text,
  push_body text,
  push_target text default ''::text,
  push_tag text default 'kunthai'::text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_secret text;
begin
  if recipient_ids is null or array_length(recipient_ids, 1) is null then
    return;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kunthai_push_trigger_secret'
  limit 1;
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/push-send',
    body := jsonb_build_object(
      'user_ids', to_jsonb(recipient_ids),
      'title', coalesce(push_title, 'KunThai'),
      'body', coalesce(push_body, ''),
      'target', coalesce(push_target, ''),
      'tag', coalesce(push_tag, 'kunthai'),
      'url', '/'
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
exception when others then
  null; -- push delivery must never break the write that triggered it
end;
$function$;

revoke execute on function public.send_kunthai_push(uuid[], text, text, text, text)
  from public, anon, authenticated;

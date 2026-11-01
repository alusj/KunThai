-- The kunthai-native-push-drain cron job called kunthai_kick_native_push()
-- every minute, which posts to the send-native-push edge function through
-- pg_net even when push_outbox is empty: about 1,440 HTTP calls a day, each
-- writing pg_net request and response rows, for nothing.
--
-- Only kick when a push is actually waiting. Pushes queued by the app are
-- still kicked immediately by the push_outbox trigger; this job remains the
-- once-a-minute safety net for retries. push_outbox_ready_idx covers the check.
do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  perform cron.alter_job(
    job.jobid,
    command := $cmd$select public.kunthai_kick_native_push() where exists (select 1 from public.push_outbox where sent_at is null and dead_at is null)$cmd$
  )
  from cron.job job
  where job.jobname = 'kunthai-native-push-drain';
end;
$$;

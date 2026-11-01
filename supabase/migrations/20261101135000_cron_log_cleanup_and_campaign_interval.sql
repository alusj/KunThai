-- Applied to production on 2026-11-01 while the project was out of Disk IO
-- budget; recorded here so the repo matches the database.
--
-- cron.job_run_details had grown to 132k rows: three jobs run every minute
-- and every run is logged. Keep one day of history.
-- Scheduled campaigns can go out up to five minutes late, so that job no
-- longer needs to run every minute.
do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  if not exists (select 1 from cron.job where jobname = 'kunthai-cron-log-cleanup') then
    perform cron.schedule(
      'kunthai-cron-log-cleanup',
      '40 3 * * *',
      $cmd$delete from cron.job_run_details where end_time < now() - interval '1 day'$cmd$
    );
  end if;

  perform cron.alter_job(job.jobid, schedule := '*/5 * * * *')
  from cron.job job
  where job.jobname = 'kunthai-publish-due-campaigns';
end;
$$;

DROP EXTENSION IF EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('sheet-outbox-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sheet-outbox-drain');

SELECT cron.schedule(
  'sheet-outbox-drain',
  '7 * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://trailerchecker.lovable.app/api/public/sheet-drain',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-drain-secret', (SELECT token FROM public.internal_job_tokens WHERE name = 'sheet_drain')
    ),
    body := '{}'::jsonb
  );
  $$
);
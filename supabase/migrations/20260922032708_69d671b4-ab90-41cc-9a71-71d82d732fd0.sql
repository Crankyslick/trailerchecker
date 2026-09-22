CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.internal_job_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.internal_job_tokens FROM anon, authenticated;
GRANT ALL ON public.internal_job_tokens TO service_role;
ALTER TABLE public.internal_job_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_job_tokens (name, token)
VALUES ('sheet_drain', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('sheet-outbox-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sheet-outbox-drain');

SELECT cron.schedule(
  'sheet-outbox-drain',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://trailerchecker.lovable.app/api/public/sheet-drain',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-drain-secret', (SELECT token FROM public.internal_job_tokens WHERE name = 'sheet_drain')
    ),
    body := '{}'::jsonb
  );
  $$
);
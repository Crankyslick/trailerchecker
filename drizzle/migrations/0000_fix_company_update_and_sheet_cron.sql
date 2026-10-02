GRANT UPDATE ON public.companies TO authenticated;
DROP POLICY IF EXISTS "admins update own company" ON public.companies;
CREATE POLICY "admins update own company" ON public.companies FOR UPDATE TO authenticated
USING (id = public.current_company_id() AND public.current_user_has_any_role(ARRAY['owner'::app_role,'admin'::app_role]))
WITH CHECK (id = public.current_company_id() AND public.current_user_has_any_role(ARRAY['owner'::app_role,'admin'::app_role]));

SELECT cron.unschedule('sheet-outbox-drain') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sheet-outbox-drain');
SELECT cron.schedule('sheet-outbox-drain','7 * * * *', $c$
  SELECT net.http_post(
    url := 'https://trailerchecker.lovable.app/api/public/sheet-drain',
    headers := jsonb_build_object('content-type','application/json','x-drain-secret',(SELECT token FROM public.internal_job_tokens WHERE name='sheet_drain')),
    body := '{}'::jsonb
  );
$c$);
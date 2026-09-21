-- 1. Sheet outbox: claim + lease + durable dedupe key
ALTER TABLE public.sheet_sync_outbox
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE public.sheet_sync_outbox DROP CONSTRAINT IF EXISTS sheet_sync_outbox_status_check;
ALTER TABLE public.sheet_sync_outbox ADD CONSTRAINT sheet_sync_outbox_status_check
  CHECK (status = ANY (ARRAY['pending'::text,'processing'::text,'done'::text,'failed'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS sheet_sync_outbox_dedupe
  ON public.sheet_sync_outbox (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sheet_sync_outbox_claimable
  ON public.sheet_sync_outbox (status, next_attempt_at);

CREATE OR REPLACE FUNCTION public.claim_sheet_outbox(
  p_worker text,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120,
  p_company_id uuid DEFAULT NULL
)
RETURNS SETOF public.sheet_sync_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := COALESCE(public.current_company_id(), p_company_id);
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
      FROM public.sheet_sync_outbox o
     WHERE (v_company IS NULL OR o.company_id = v_company)
       AND (
         (o.status = 'pending' AND o.next_attempt_at <= now())
         OR (o.status = 'processing' AND COALESCE(o.lease_expires_at, now()) < now())
       )
     ORDER BY o.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  )
  UPDATE public.sheet_sync_outbox o
     SET status = 'processing',
         claimed_by = p_worker,
         claimed_at = now(),
         lease_expires_at = now() + make_interval(secs => GREATEST(30, COALESCE(p_lease_seconds, 120))),
         updated_at = now()
    FROM candidates c
   WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sheet_outbox(text,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_sheet_outbox(text,integer,integer,uuid) TO authenticated, service_role;

-- 2. Company settings (yard turnaround policy) + audit log
CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  yard_deadline_hours integer NOT NULL DEFAULT 24,
  yard_critical_hours integer NOT NULL DEFAULT 48,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_hours_check CHECK (
    yard_deadline_hours BETWEEN 1 AND 168
    AND yard_critical_hours > yard_deadline_hours
    AND yard_critical_hours <= 336
  )
);

GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read company settings" ON public.company_settings;
CREATE POLICY "staff read company settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "admins insert company settings" ON public.company_settings;
CREATE POLICY "admins insert company settings" ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::app_role[])
  );

DROP POLICY IF EXISTS "admins update company settings" ON public.company_settings;
CREATE POLICY "admins update company settings" ON public.company_settings
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::app_role[])
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::app_role[])
  );

DROP TRIGGER IF EXISTS company_settings_touch ON public.company_settings;
CREATE TRIGGER company_settings_touch BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.company_setting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_setting_events TO authenticated;
GRANT ALL ON public.company_setting_events TO service_role;
ALTER TABLE public.company_setting_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read setting history" ON public.company_setting_events;
CREATE POLICY "staff read setting history" ON public.company_setting_events
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE OR REPLACE FUNCTION public.log_company_setting_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.yard_deadline_hours IS DISTINCT FROM OLD.yard_deadline_hours THEN
    INSERT INTO public.company_setting_events (company_id, field, old_value, new_value, changed_by)
    VALUES (NEW.company_id, 'yard_deadline_hours',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.yard_deadline_hours::text END,
            NEW.yard_deadline_hours::text, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.yard_critical_hours IS DISTINCT FROM OLD.yard_critical_hours THEN
    INSERT INTO public.company_setting_events (company_id, field, old_value, new_value, changed_by)
    VALUES (NEW.company_id, 'yard_critical_hours',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.yard_critical_hours::text END,
            NEW.yard_critical_hours::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_settings_audit ON public.company_settings;
CREATE TRIGGER company_settings_audit AFTER INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_company_setting_changes();

INSERT INTO public.company_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- 3. Deprecate the legacy dual data model
REVOKE ALL ON public.loads FROM anon, authenticated;
REVOKE ALL ON public.clients FROM anon, authenticated;
REVOKE ALL ON public.sync_config FROM anon, authenticated;
REVOKE ALL ON public.legacy_trailer_events FROM anon, authenticated;
REVOKE ALL ON public.legacy_yard_check_ins FROM anon, authenticated;

COMMENT ON TABLE public.loads IS 'DEPRECATED - superseded by public.trailer_loads. Read-only fallback, no client grants.';
COMMENT ON TABLE public.clients IS 'DEPRECATED - superseded by public.trailer_clients. Read-only fallback, no client grants.';
COMMENT ON TABLE public.sync_config IS 'DEPRECATED - superseded by public.trailer_sync_config + public.sync_secrets.';
COMMENT ON TABLE public.legacy_trailer_events IS 'DEPRECATED - superseded by public.trailer_events.';
COMMENT ON TABLE public.legacy_yard_check_ins IS 'DEPRECATED - superseded by public.yard_check_ins.';
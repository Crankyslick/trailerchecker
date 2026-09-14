CREATE TABLE public.sheet_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('update','append')),
  match_column text,
  match_value text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_sync_outbox TO authenticated;
GRANT ALL ON public.sheet_sync_outbox TO service_role;

ALTER TABLE public.sheet_sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox select own company" ON public.sheet_sync_outbox
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE POLICY "outbox insert own company" ON public.sheet_sync_outbox
  FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "outbox update staff" ON public.sheet_sync_outbox
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE POLICY "outbox delete staff" ON public.sheet_sync_outbox
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE INDEX idx_outbox_pending ON public.sheet_sync_outbox (company_id, status, next_attempt_at);

CREATE TRIGGER sheet_sync_outbox_updated
  BEFORE UPDATE ON public.sheet_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sheet_sync_outbox_lock_company
  BEFORE UPDATE ON public.sheet_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();
-- QuickBooks Online integration, scoped to companies

CREATE TABLE public.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  company_name text,
  environment text NOT NULL DEFAULT 'production',
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  last_synced_at timestamptz,
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT ALL ON public.qbo_connections TO service_role;
ALTER TABLE public.qbo_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbo connections service role only" ON public.qbo_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER qbo_connections_updated BEFORE UPDATE ON public.qbo_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.qbo_oauth_states (
  state text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.qbo_oauth_states TO service_role;
ALTER TABLE public.qbo_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbo oauth states service role only" ON public.qbo_oauth_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.qbo_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  revenue_code text NOT NULL,
  qbo_item_name text,
  qbo_income_account text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, revenue_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qbo_account_mappings TO authenticated;
GRANT ALL ON public.qbo_account_mappings TO service_role;
ALTER TABLE public.qbo_account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing staff read qbo mappings" ON public.qbo_account_mappings
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin','billing']::public.app_role[])
  );
CREATE POLICY "billing staff write qbo mappings" ON public.qbo_account_mappings
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin','billing']::public.app_role[])
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin','billing']::public.app_role[])
  );
CREATE TRIGGER qbo_account_mappings_updated BEFORE UPDATE ON public.qbo_account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS qbo_sync_error text,
  ADD COLUMN IF NOT EXISTS qbo_synced_at timestamptz;

ALTER TABLE public.trailer_clients
  ADD COLUMN IF NOT EXISTS qbo_customer_id text;
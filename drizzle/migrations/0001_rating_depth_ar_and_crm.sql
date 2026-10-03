ALTER TABLE public.trailer_clients ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 30;
ALTER TABLE public.trailer_clients ADD COLUMN IF NOT EXISTS credit_limit numeric(10,2);
DROP FUNCTION IF EXISTS public.apply_rate_to_load(uuid, uuid, numeric);

ALTER TABLE public.rate_agreements ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.rate_agreements ADD COLUMN IF NOT EXISTS root_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.rate_agreements ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.rate_agreements ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES public.rate_agreements(id);
ALTER TABLE public.rate_agreements ADD COLUMN IF NOT EXISTS additional_stop_rate numeric(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS rate_agreements_root_current_idx ON public.rate_agreements(root_id) WHERE superseded_by_id IS NULL;

CREATE TABLE public.rate_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_agreement_id uuid NOT NULL REFERENCES public.rate_agreements(id) ON DELETE CASCADE,
  min_weight numeric(10,2) NOT NULL DEFAULT 0,
  max_weight numeric(10,2),
  linehaul_rate numeric(10,2) NOT NULL,
  CHECK (max_weight IS NULL OR max_weight > min_weight)
);
CREATE INDEX rate_breaks_agreement_idx ON public.rate_breaks(rate_agreement_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_breaks TO authenticated;
GRANT ALL ON public.rate_breaks TO service_role;
ALTER TABLE public.rate_breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read rate_breaks" ON public.rate_breaks FOR SELECT TO authenticated
  USING (rate_agreement_id IN (SELECT id FROM public.rate_agreements WHERE company_id = public.current_company_id()) AND public.is_staff());
CREATE POLICY "company write rate_breaks" ON public.rate_breaks FOR ALL TO authenticated
  USING (rate_agreement_id IN (SELECT id FROM public.rate_agreements WHERE company_id = public.current_company_id()) AND public.is_dispatcher_or_admin())
  WITH CHECK (rate_agreement_id IN (SELECT id FROM public.rate_agreements WHERE company_id = public.current_company_id()) AND public.is_dispatcher_or_admin());

CREATE OR REPLACE FUNCTION public.revise_rate_agreement(
  p_rate_agreement_id uuid, p_new_linehaul_rate numeric, p_new_fuel_surcharge_pct numeric, p_effective_start date DEFAULT current_date)
RETURNS public.rate_agreements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_old public.rate_agreements; v_new public.rate_agreements;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to revise rates'; END IF;
  SELECT * INTO v_old FROM public.rate_agreements
  WHERE id = p_rate_agreement_id AND company_id = v_company AND superseded_by_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate agreement not found or already superseded'; END IF;
  UPDATE public.rate_agreements SET effective_end = p_effective_start - 1 WHERE id = v_old.id;
  INSERT INTO public.rate_agreements (company_id, client_id, contract_number, origin_code, destination_code,
    rate_type, linehaul_rate, fuel_surcharge_pct, additional_stop_rate, effective_start, root_id, version)
  VALUES (v_company, v_old.client_id, v_old.contract_number, v_old.origin_code, v_old.destination_code,
    v_old.rate_type, p_new_linehaul_rate, p_new_fuel_surcharge_pct, v_old.additional_stop_rate,
    p_effective_start, v_old.root_id, v_old.version + 1)
  RETURNING * INTO v_new;
  UPDATE public.rate_agreements SET superseded_by_id = v_new.id WHERE id = v_old.id;
  RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.revise_rate_agreement(uuid, numeric, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_rate_agreement(uuid, numeric, numeric, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_rate_to_load(
  p_load_id uuid, p_rate_agreement_id uuid, p_miles numeric DEFAULT NULL, p_weight numeric DEFAULT NULL)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_rate public.rate_agreements; v_break public.rate_breaks;
  v_base_rate numeric; v_linehaul numeric; v_stop_count integer; v_extra_stops integer; v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to set rates'; END IF;
  SELECT * INTO v_rate FROM public.rate_agreements WHERE id = p_rate_agreement_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate agreement not found'; END IF;
  v_base_rate := v_rate.linehaul_rate;
  IF p_weight IS NOT NULL THEN
    SELECT * INTO v_break FROM public.rate_breaks
    WHERE rate_agreement_id = v_rate.id AND p_weight >= min_weight AND (max_weight IS NULL OR p_weight <= max_weight)
    ORDER BY min_weight DESC LIMIT 1;
    IF FOUND THEN v_base_rate := v_break.linehaul_rate; END IF;
  END IF;
  v_linehaul := CASE WHEN v_rate.rate_type = 'PER_MILE' THEN v_base_rate * COALESCE(p_miles, 0) ELSE v_base_rate END;
  IF v_rate.additional_stop_rate > 0 THEN
    SELECT count(*) INTO v_stop_count FROM public.stops s
    JOIN public.legs lg ON lg.shipment_id = s.shipment_id
    JOIN public.trailer_loads tl ON tl.leg_id = lg.id WHERE tl.id = p_load_id;
    v_extra_stops := GREATEST(COALESCE(NULLIF(v_stop_count,0), 2) - 2, 0);
    v_linehaul := v_linehaul + (v_extra_stops * v_rate.additional_stop_rate);
  END IF;
  UPDATE public.trailer_loads SET customer_rate = v_linehaul,
    fuel_surcharge_amount = round(v_linehaul * v_rate.fuel_surcharge_pct / 100.0, 2)
  WHERE id = p_load_id AND company_id = v_company RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.apply_rate_to_load(uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_rate_to_load(uuid, uuid, numeric, numeric) TO authenticated, service_role;

ALTER TABLE public.accessorials ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.accessorials ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.accessorials ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.accessorials ADD COLUMN IF NOT EXISTS rejected_reason text;
UPDATE public.accessorials SET status = 'APPROVED', approved_at = created_at WHERE status = 'PENDING';
ALTER TABLE public.accessorials ADD CONSTRAINT accessorials_status_check CHECK (status IN ('PENDING','APPROVED','REJECTED'));

CREATE OR REPLACE FUNCTION public.approve_accessorial(p_accessorial_id uuid)
RETURNS public.accessorials LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.accessorials;
BEGIN
  IF NOT public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can approve an accessorial'; END IF;
  UPDATE public.accessorials SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_accessorial_id AND company_id = public.current_company_id() AND status = 'PENDING' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accessorial not found or not pending'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.approve_accessorial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_accessorial(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_accessorial(p_accessorial_id uuid, p_reason text)
RETURNS public.accessorials LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.accessorials;
BEGIN
  IF NOT public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can reject an accessorial'; END IF;
  UPDATE public.accessorials SET status = 'REJECTED', approved_by = auth.uid(), approved_at = now(), rejected_reason = p_reason
  WHERE id = p_accessorial_id AND company_id = public.current_company_id() AND status = 'PENDING' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accessorial not found or not pending'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.reject_accessorial(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_accessorial(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_customer_invoice(p_client_id uuid, p_load_ids uuid[])
RETURNS public.customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_invoice public.customer_invoices; v_load public.trailer_loads;
  v_line_total numeric; v_total numeric := 0; v_client public.trailer_clients; v_outstanding numeric;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to generate invoices'; END IF;
  SELECT * INTO v_client FROM public.trailer_clients WHERE id = p_client_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  INSERT INTO public.customer_invoices (company_id, client_id, invoice_number, status)
  VALUES (v_company, p_client_id, 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6), 'DRAFT')
  RETURNING * INTO v_invoice;
  FOR v_load IN SELECT * FROM public.trailer_loads WHERE id = ANY(p_load_ids) AND company_id = v_company FOR UPDATE LOOP
    IF v_load.invoice_status = 'INVOICED' THEN RAISE EXCEPTION 'Load % is already invoiced', v_load.schedule_id; END IF;
    v_line_total := COALESCE(v_load.customer_rate, 0) + COALESCE(v_load.fuel_surcharge_amount, 0);
    INSERT INTO public.customer_invoice_lines (invoice_id, load_id, description, amount)
    VALUES (v_invoice.id, v_load.id, 'Linehaul + fuel — ' || v_load.schedule_id, v_line_total);
    v_total := v_total + v_line_total;
    INSERT INTO public.customer_invoice_lines (invoice_id, load_id, description, amount)
    SELECT v_invoice.id, v_load.id, code || COALESCE(': ' || description, ''), amount
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CUSTOMER' AND status = 'APPROVED';
    SELECT v_total + COALESCE(SUM(amount), 0) INTO v_total
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CUSTOMER' AND status = 'APPROVED';
    UPDATE public.trailer_loads SET invoice_status = 'INVOICED' WHERE id = v_load.id;
  END LOOP;
  IF v_client.credit_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_outstanding FROM public.customer_invoices
    WHERE client_id = p_client_id AND status IN ('SENT','DISPUTED');
    IF v_outstanding + v_total > v_client.credit_limit THEN
      RAISE EXCEPTION 'This invoice would put % over its credit limit ($% outstanding + $% new > $% limit)',
        v_client.name, v_outstanding, v_total, v_client.credit_limit;
    END IF;
  END IF;
  UPDATE public.customer_invoices SET total_amount = v_total, issued_at = now(),
    due_at = COALESCE(due_at, current_date + COALESCE(v_client.payment_terms_days, 30))
  WHERE id = v_invoice.id RETURNING * INTO v_invoice;
  RETURN v_invoice;
END; $$;
REVOKE ALL ON FUNCTION public.generate_customer_invoice(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_customer_invoice(uuid, uuid[]) TO authenticated, service_role;

ALTER TABLE public.customer_invoices DROP CONSTRAINT IF EXISTS customer_invoices_status_check;
ALTER TABLE public.customer_invoices ADD CONSTRAINT customer_invoices_status_check
  CHECK (status IN ('DRAFT','SENT','PAID','VOID','DISPUTED'));
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS disputed_at timestamptz;
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;

CREATE OR REPLACE FUNCTION public.dispute_invoice(p_invoice_id uuid, p_reason text)
RETURNS public.customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.customer_invoices;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to dispute an invoice'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A dispute reason is required'; END IF;
  UPDATE public.customer_invoices SET status = 'DISPUTED', dispute_reason = p_reason, disputed_at = now(), dispute_resolved_at = NULL
  WHERE id = p_invoice_id AND company_id = public.current_company_id() RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.dispute_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_invoice(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_invoice_dispute(p_invoice_id uuid, p_new_status text)
RETURNS public.customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.customer_invoices;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to resolve a dispute'; END IF;
  IF p_new_status NOT IN ('SENT','PAID','VOID') THEN RAISE EXCEPTION 'Resolved status must be SENT, PAID, or VOID'; END IF;
  UPDATE public.customer_invoices SET status = p_new_status, dispute_resolved_at = now(),
    paid_at = CASE WHEN p_new_status = 'PAID' THEN now() ELSE paid_at END
  WHERE id = p_invoice_id AND company_id = public.current_company_id() AND status = 'DISPUTED' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found or not disputed'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_invoice_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_invoice_dispute(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.customer_invoice_aging WITH (security_invoker = true) AS
SELECT ci.id, ci.company_id, ci.client_id, tc.name AS client_name, ci.invoice_number, ci.status, ci.total_amount, ci.due_at,
  CASE WHEN ci.due_at IS NULL THEN NULL ELSE (current_date - ci.due_at) END AS days_past_due,
  CASE WHEN ci.due_at IS NULL OR current_date <= ci.due_at THEN 'current'
       WHEN current_date - ci.due_at <= 30 THEN '1-30'
       WHEN current_date - ci.due_at <= 60 THEN '31-60'
       WHEN current_date - ci.due_at <= 90 THEN '61-90'
       ELSE '90+' END AS aging_bucket
FROM public.customer_invoices ci JOIN public.trailer_clients tc ON tc.id = ci.client_id
WHERE ci.status IN ('SENT','DISPUTED');
GRANT SELECT ON public.customer_invoice_aging TO authenticated;

CREATE TABLE public.trailer_client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.trailer_clients(id) ON DELETE CASCADE,
  name text NOT NULL, title text, email text, phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trailer_client_contacts_client_idx ON public.trailer_client_contacts(client_id);
CREATE UNIQUE INDEX trailer_client_contacts_one_primary_idx ON public.trailer_client_contacts(client_id) WHERE is_primary;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_client_contacts TO authenticated;
GRANT ALL ON public.trailer_client_contacts TO service_role;
ALTER TABLE public.trailer_client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read client contacts" ON public.trailer_client_contacts FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write client contacts" ON public.trailer_client_contacts FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE TABLE public.trailer_client_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.trailer_clients(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('call','email','note','meeting','system')),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trailer_client_activities_client_idx ON public.trailer_client_activities(client_id, created_at DESC);
GRANT SELECT, INSERT ON public.trailer_client_activities TO authenticated;
GRANT ALL ON public.trailer_client_activities TO service_role;
ALTER TABLE public.trailer_client_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read client activity" ON public.trailer_client_activities FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company log client activity" ON public.trailer_client_activities FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.is_staff() AND activity_type <> 'system');

CREATE OR REPLACE FUNCTION public.log_invoice_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trailer_client_activities (company_id, client_id, activity_type, note, created_by)
    VALUES (NEW.company_id, NEW.client_id, 'system', 'Invoice ' || NEW.invoice_number || ' → ' || NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.log_invoice_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_invoice_activity() TO service_role;
CREATE TRIGGER customer_invoices_log_activity AFTER UPDATE OF status ON public.customer_invoices
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_activity();

ALTER TABLE public.trailer_client_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.trailer_client_activities REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trailer_client_contacts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trailer_client_activities; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.accessorials; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
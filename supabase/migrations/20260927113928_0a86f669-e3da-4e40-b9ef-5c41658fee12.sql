ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS customer_rate numeric(10,2);
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS fuel_surcharge_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS carrier_pay numeric(10,2);
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS invoice_status text NOT NULL DEFAULT 'NOT_INVOICED';
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'NOT_SETTLED';

CREATE TABLE public.rate_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.trailer_clients(id) ON DELETE CASCADE,
  origin_code text,
  destination_code text,
  rate_type text NOT NULL DEFAULT 'FLAT',
  linehaul_rate numeric(10,2) NOT NULL,
  fuel_surcharge_pct numeric(5,2) NOT NULL DEFAULT 0,
  effective_start date NOT NULL DEFAULT current_date,
  effective_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_agreements_lane_idx ON public.rate_agreements(company_id, client_id, origin_code, destination_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_agreements TO authenticated;
GRANT ALL ON public.rate_agreements TO service_role;
ALTER TABLE public.rate_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read rate_agreements" ON public.rate_agreements FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write rate_agreements" ON public.rate_agreements FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER rate_agreements_updated BEFORE UPDATE ON public.rate_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_rate_to_load(p_load_id uuid, p_rate_agreement_id uuid, p_miles numeric DEFAULT NULL)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid;
  v_rate public.rate_agreements;
  v_linehaul numeric;
  v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to set rates';
  END IF;
  SELECT * INTO v_rate FROM public.rate_agreements WHERE id = p_rate_agreement_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate agreement not found'; END IF;
  v_linehaul := CASE WHEN v_rate.rate_type = 'PER_MILE' THEN v_rate.linehaul_rate * COALESCE(p_miles, 0)
                     ELSE v_rate.linehaul_rate END;
  UPDATE public.trailer_loads
     SET customer_rate = v_linehaul,
         fuel_surcharge_amount = round(v_linehaul * v_rate.fuel_surcharge_pct / 100.0, 2)
   WHERE id = p_load_id AND company_id = v_company
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_rate_to_load(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_rate_to_load(uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_load_financials(
  p_load_id uuid, p_customer_rate numeric, p_fuel_surcharge_amount numeric, p_carrier_pay numeric
) RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.trailer_loads;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to set load financials';
  END IF;
  UPDATE public.trailer_loads
     SET customer_rate = COALESCE(p_customer_rate, customer_rate),
         fuel_surcharge_amount = COALESCE(p_fuel_surcharge_amount, fuel_surcharge_amount),
         carrier_pay = COALESCE(p_carrier_pay, carrier_pay)
   WHERE id = p_load_id AND company_id = public.current_company_id()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_load_financials(uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_load_financials(uuid, numeric, numeric, numeric) TO authenticated;

CREATE TABLE public.accessorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  amount numeric(10,2) NOT NULL,
  billable_to text NOT NULL DEFAULT 'CUSTOMER',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (billable_to IN ('CUSTOMER','CARRIER'))
);
CREATE INDEX accessorials_load_idx ON public.accessorials(load_id);
GRANT SELECT, INSERT, DELETE ON public.accessorials TO authenticated;
GRANT ALL ON public.accessorials TO service_role;
ALTER TABLE public.accessorials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read accessorials" ON public.accessorials FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write accessorials" ON public.accessorials FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  mc_number text,
  contact_info text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read carriers" ON public.carriers FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write carriers" ON public.carriers FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER carriers_updated BEFORE UPDATE ON public.carriers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.trailer_clients(id),
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  issued_at timestamptz,
  due_at date,
  paid_at timestamptz,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);
CREATE TABLE public.customer_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id),
  description text NOT NULL,
  amount numeric(10,2) NOT NULL
);
CREATE TABLE public.carrier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  carrier_id uuid NOT NULL REFERENCES public.carriers(id),
  settlement_number text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  paid_at timestamptz,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, settlement_number)
);
CREATE TABLE public.carrier_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.carrier_settlements(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id),
  description text NOT NULL,
  amount numeric(10,2) NOT NULL
);

GRANT SELECT, INSERT, UPDATE ON public.customer_invoices, public.customer_invoice_lines,
  public.carrier_settlements, public.carrier_settlement_lines TO authenticated;
GRANT ALL ON public.customer_invoices, public.customer_invoice_lines,
  public.carrier_settlements, public.carrier_settlement_lines TO service_role;
ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_settlement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company read invoices" ON public.customer_invoices FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write invoices" ON public.customer_invoices FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE POLICY "company read invoice lines" ON public.customer_invoice_lines FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.customer_invoices WHERE company_id = public.current_company_id()) AND public.is_staff());
CREATE POLICY "company read settlements" ON public.carrier_settlements FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write settlements" ON public.carrier_settlements FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE POLICY "company read settlement lines" ON public.carrier_settlement_lines FOR SELECT TO authenticated
  USING (settlement_id IN (SELECT id FROM public.carrier_settlements WHERE company_id = public.current_company_id()) AND public.is_staff());

CREATE OR REPLACE FUNCTION public.generate_customer_invoice(p_client_id uuid, p_load_ids uuid[])
RETURNS public.customer_invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid;
  v_invoice public.customer_invoices;
  v_load public.trailer_loads;
  v_line_total numeric;
  v_total numeric := 0;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to generate invoices';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trailer_clients WHERE id = p_client_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;
  INSERT INTO public.customer_invoices (company_id, client_id, invoice_number, status)
  VALUES (v_company, p_client_id, 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6), 'DRAFT')
  RETURNING * INTO v_invoice;
  FOR v_load IN SELECT * FROM public.trailer_loads WHERE id = ANY(p_load_ids) AND company_id = v_company FOR UPDATE LOOP
    IF v_load.invoice_status = 'INVOICED' THEN
      RAISE EXCEPTION 'Load % is already invoiced', v_load.schedule_id;
    END IF;
    v_line_total := COALESCE(v_load.customer_rate, 0) + COALESCE(v_load.fuel_surcharge_amount, 0);
    INSERT INTO public.customer_invoice_lines (invoice_id, load_id, description, amount)
    VALUES (v_invoice.id, v_load.id, 'Linehaul + fuel — ' || v_load.schedule_id, v_line_total);
    v_total := v_total + v_line_total;
    INSERT INTO public.customer_invoice_lines (invoice_id, load_id, description, amount)
    SELECT v_invoice.id, v_load.id, code || COALESCE(': ' || description, ''), amount
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CUSTOMER';
    SELECT v_total + COALESCE(SUM(amount), 0) INTO v_total
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CUSTOMER';
    UPDATE public.trailer_loads SET invoice_status = 'INVOICED' WHERE id = v_load.id;
  END LOOP;
  UPDATE public.customer_invoices SET total_amount = v_total, issued_at = now() WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;
  RETURN v_invoice;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_customer_invoice(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_customer_invoice(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_carrier_settlement(p_carrier_id uuid, p_load_ids uuid[])
RETURNS public.carrier_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid;
  v_settlement public.carrier_settlements;
  v_load public.trailer_loads;
  v_line_total numeric;
  v_total numeric := 0;
BEGIN
  v_company := public.current_company_id();
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to generate settlements';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.carriers WHERE id = p_carrier_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Carrier not found';
  END IF;
  INSERT INTO public.carrier_settlements (company_id, carrier_id, settlement_number, status)
  VALUES (v_company, p_carrier_id, 'STL-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6), 'PENDING')
  RETURNING * INTO v_settlement;
  FOR v_load IN SELECT * FROM public.trailer_loads WHERE id = ANY(p_load_ids) AND company_id = v_company FOR UPDATE LOOP
    IF v_load.settlement_status = 'SETTLED' THEN
      RAISE EXCEPTION 'Load % is already settled', v_load.schedule_id;
    END IF;
    v_line_total := COALESCE(v_load.carrier_pay, 0);
    INSERT INTO public.carrier_settlement_lines (settlement_id, load_id, description, amount)
    VALUES (v_settlement.id, v_load.id, 'Carrier pay — ' || v_load.schedule_id, v_line_total);
    v_total := v_total + v_line_total;
    INSERT INTO public.carrier_settlement_lines (settlement_id, load_id, description, amount)
    SELECT v_settlement.id, v_load.id, code || COALESCE(': ' || description, ''), amount
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CARRIER';
    SELECT v_total + COALESCE(SUM(amount), 0) INTO v_total
    FROM public.accessorials WHERE load_id = v_load.id AND billable_to = 'CARRIER';
    UPDATE public.trailer_loads SET settlement_status = 'SETTLED' WHERE id = v_load.id;
  END LOOP;
  UPDATE public.carrier_settlements SET total_amount = v_total WHERE id = v_settlement.id
  RETURNING * INTO v_settlement;
  RETURN v_settlement;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_carrier_settlement(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_carrier_settlement(uuid, uuid[]) TO authenticated;
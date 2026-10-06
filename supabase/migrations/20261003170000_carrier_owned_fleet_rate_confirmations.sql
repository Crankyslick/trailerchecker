-- ============================================================================
-- Carrier-owned-fleet data model (default workflow) + rate confirmations.
--
-- Context: the existing load model already supports brokering a load OUT to
-- a third-party carrier (carriers / tenders, set via create_tender /
-- respond_to_tender) and hauling a load IN-HOUSE with this company's own
-- driver + trailer (driver_id / equipment_id, set via plan_leg). What was
-- missing is the party on the OTHER side of an in-house haul: the broker
-- (or shipper) who tendered freight TO this company, the tractor that
-- actually pulled it, and the rate-confirmation document that names the
-- hauling carrier's own MC/DOT (this company's own authority, not a
-- tendered-out carrier's).
--
-- Design:
--   * public.brokers         — a NEW, separate party: whoever tendered a
--                               load to this company. Distinct from
--                               trailer_clients (this company's own direct
--                               shipper/customer) and from carriers (who
--                               THIS company tenders loads OUT to).
--   * public.tractors        — the power-unit equivalent of public.equipment
--                               (which, despite its generic name, only ever
--                               modeled trailers).
--   * public.rate_confirmations — the RC document itself: who issued it
--                               (broker or direct shipper), and the MC/DOT of
--                               the carrier actually hauling the load — which
--                               defaults to this company's own authority
--                               (companies.mc_number/dot_number) because the
--                               carrier-owned-fleet model is the default, but
--                               stays editable for edge cases (e.g. hauling
--                               under a sister entity's authority).
--   * trailer_loads gains tractor_id / broker_id / rate_confirmation_id, plus
--     a generated haul_type column so every load states, without any extra
--     query, whether it was hauled internally or tendered out — carrier_id
--     being set is the only thing that ever makes a load "brokered"; having
--     a `carriers` table in the schema never forces that path on anyone.
--
-- All additive and idempotent: safe to run even with the confirmed schema
-- drift around rate_breaks / revise_rate_agreement() / extra rate_agreements
-- columns that predates this migration file.
-- ============================================================================

-- ============ brokers: who tendered freight TO this company ============
CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
                REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  mc_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brokers_company_idx ON public.brokers(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brokers TO authenticated;
GRANT ALL ON public.brokers TO service_role;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company read brokers" ON public.brokers;
CREATE POLICY "company read brokers" ON public.brokers FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write brokers" ON public.brokers;
CREATE POLICY "company write brokers" ON public.brokers FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
DROP TRIGGER IF EXISTS brokers_updated ON public.brokers;
CREATE TRIGGER brokers_updated BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS brokers_prevent_company_change ON public.brokers;
CREATE TRIGGER brokers_prevent_company_change BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

-- ============ tractors: the power-unit equivalent of public.equipment ============
CREATE TABLE IF NOT EXISTS public.tractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
                REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  vin text,
  plate_number text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, unit_number)
);
CREATE INDEX IF NOT EXISTS tractors_company_idx ON public.tractors(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tractors TO authenticated;
GRANT ALL ON public.tractors TO service_role;
ALTER TABLE public.tractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company read tractors" ON public.tractors;
CREATE POLICY "company read tractors" ON public.tractors FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write tractors" ON public.tractors;
CREATE POLICY "company write tractors" ON public.tractors FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
DROP TRIGGER IF EXISTS tractors_updated ON public.tractors;
CREATE TRIGGER tractors_updated BEFORE UPDATE ON public.tractors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS tractors_prevent_company_change ON public.tractors;
CREATE TRIGGER tractors_prevent_company_change BEFORE UPDATE ON public.tractors
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

-- ============ rate_confirmations: the RC document ============
CREATE TABLE IF NOT EXISTS public.rate_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
                REFERENCES public.companies(id) ON DELETE CASCADE,
  rc_number text,
  -- Who issued/sent this RC to us: a broker tendering freight in, a direct
  -- shipper, or neither (free-standing / entered manually). At most one of
  -- the two may be set — a single RC has exactly one counterparty.
  broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.trailer_clients(id) ON DELETE SET NULL,
  -- The hauling carrier's own authority, i.e. whoever is actually running
  -- the truck under this RC. Defaults to this company's own MC/DOT (see the
  -- trigger below) because carrier-owned-fleet is the default operating
  -- model, but stays editable for a sister entity or other edge case.
  operating_carrier_name text,
  operating_mc_number text,
  operating_dot_number text,
  total_rate numeric(10,2),
  rate_notes text,
  issued_at date NOT NULL DEFAULT current_date,
  document_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_confirmations_one_counterparty CHECK (
    (broker_id IS NOT NULL)::int + (client_id IS NOT NULL)::int <= 1
  )
);
CREATE INDEX IF NOT EXISTS rate_confirmations_company_idx ON public.rate_confirmations(company_id);
CREATE INDEX IF NOT EXISTS rate_confirmations_broker_idx ON public.rate_confirmations(broker_id);
CREATE INDEX IF NOT EXISTS rate_confirmations_client_idx ON public.rate_confirmations(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_confirmations TO authenticated;
GRANT ALL ON public.rate_confirmations TO service_role;
ALTER TABLE public.rate_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company read rate_confirmations" ON public.rate_confirmations;
CREATE POLICY "company read rate_confirmations" ON public.rate_confirmations FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write rate_confirmations" ON public.rate_confirmations;
CREATE POLICY "company write rate_confirmations" ON public.rate_confirmations FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
DROP TRIGGER IF EXISTS rate_confirmations_updated ON public.rate_confirmations;
CREATE TRIGGER rate_confirmations_updated BEFORE UPDATE ON public.rate_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS rate_confirmations_prevent_company_change ON public.rate_confirmations;
CREATE TRIGGER rate_confirmations_prevent_company_change BEFORE UPDATE ON public.rate_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

-- Default the operating carrier's MC/DOT to this company's own authority
-- (companies.mc_number/dot_number already mean exactly this — see the
-- 2026-10-01 mc_number/dot_number migration) whenever the RC doesn't name a
-- different one. This is what makes carrier-owned-fleet the default without
-- requiring every RC entry screen to re-type the company's own authority.
CREATE OR REPLACE FUNCTION public.default_rate_confirmation_operating_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies;
BEGIN
  SELECT * INTO v_company FROM public.companies WHERE id = NEW.company_id;
  IF NEW.operating_carrier_name IS NULL THEN
    NEW.operating_carrier_name := v_company.name;
  END IF;
  IF NEW.operating_mc_number IS NULL THEN
    NEW.operating_mc_number := v_company.mc_number;
  END IF;
  IF NEW.operating_dot_number IS NULL THEN
    NEW.operating_dot_number := v_company.dot_number;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.default_rate_confirmation_operating_authority() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rate_confirmations_default_authority ON public.rate_confirmations;
CREATE TRIGGER rate_confirmations_default_authority
  BEFORE INSERT ON public.rate_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.default_rate_confirmation_operating_authority();

-- ============ trailer_loads: the single place a load states every party ============
ALTER TABLE public.trailer_loads
  ADD COLUMN IF NOT EXISTS tractor_id uuid REFERENCES public.tractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_confirmation_id uuid REFERENCES public.rate_confirmations(id) ON DELETE SET NULL;

-- Derived, not stored input: a load is BROKERED_OUT exactly when it has been
-- tendered to a third-party carrier (carrier_id set by create_tender /
-- respond_to_tender), and INTERNAL otherwise — regardless of whether the
-- `carriers` table has any rows in it at all. This is the mechanism behind
-- "don't force the user into the brokerage workflow just because `carriers`
-- exists": nothing here ever requires carrier_id, broker_id, tractor_id or
-- rate_confirmation_id to be set for a load to be complete.
ALTER TABLE public.trailer_loads
  ADD COLUMN IF NOT EXISTS haul_type text GENERATED ALWAYS AS (
    CASE WHEN carrier_id IS NOT NULL THEN 'BROKERED_OUT' ELSE 'INTERNAL' END
  ) STORED;

CREATE INDEX IF NOT EXISTS trailer_loads_tractor_idx ON public.trailer_loads(tractor_id);
CREATE INDEX IF NOT EXISTS trailer_loads_broker_idx ON public.trailer_loads(broker_id);
CREATE INDEX IF NOT EXISTS trailer_loads_rate_confirmation_idx ON public.trailer_loads(rate_confirmation_id);
CREATE INDEX IF NOT EXISTS trailer_loads_haul_type_idx ON public.trailer_loads(haul_type);

-- ============ assign_load_parties: validated cross-company assignment ============
-- Mirrors plan_leg's existing pattern of checking that every referenced row
-- (driver, equipment) belongs to the caller's own company before attaching
-- it to a load — extended to the three new party references. A plain
-- `UPDATE trailer_loads` from the client would pass RLS (the caller IS
-- dispatcher/admin on their own company's load) but would not stop them from
-- pointing tractor_id/broker_id/rate_confirmation_id at a row owned by a
-- different company, since FK existence checks don't know about tenancy.
CREATE OR REPLACE FUNCTION public.assign_load_parties(
  p_load_id uuid,
  p_tractor_id uuid DEFAULT NULL,
  p_broker_id uuid DEFAULT NULL,
  p_rate_confirmation_id uuid DEFAULT NULL
)
RETURNS public.trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_row     public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to update this load';
  END IF;

  SELECT * INTO v_row FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found';
  END IF;

  IF p_tractor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tractors WHERE id = p_tractor_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'tractor belongs to a different organization';
  END IF;

  IF p_broker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brokers WHERE id = p_broker_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'broker belongs to a different organization';
  END IF;

  IF p_rate_confirmation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rate_confirmations WHERE id = p_rate_confirmation_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'rate confirmation belongs to a different organization';
  END IF;

  UPDATE public.trailer_loads
     SET tractor_id            = COALESCE(p_tractor_id, tractor_id),
         broker_id             = COALESCE(p_broker_id, broker_id),
         rate_confirmation_id  = COALESCE(p_rate_confirmation_id, rate_confirmation_id)
   WHERE id = p_load_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_load_parties(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_load_parties(uuid, uuid, uuid, uuid) TO authenticated;

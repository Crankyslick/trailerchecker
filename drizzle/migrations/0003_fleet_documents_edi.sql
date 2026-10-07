CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL, mc_number text, contact_name text, contact_email text, contact_phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
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
CREATE TRIGGER brokers_updated BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS brokers_prevent_company_change ON public.brokers;
CREATE TRIGGER brokers_prevent_company_change BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE TABLE IF NOT EXISTS public.tractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_number text NOT NULL, vin text, plate_number text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
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
CREATE TRIGGER tractors_updated BEFORE UPDATE ON public.tractors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS tractors_prevent_company_change ON public.tractors;
CREATE TRIGGER tractors_prevent_company_change BEFORE UPDATE ON public.tractors FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE TABLE IF NOT EXISTS public.rate_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  rc_number text,
  broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.trailer_clients(id) ON DELETE SET NULL,
  operating_carrier_name text, operating_mc_number text, operating_dot_number text,
  total_rate numeric(10,2), rate_notes text,
  issued_at date NOT NULL DEFAULT current_date,
  document_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_confirmations_one_counterparty CHECK ((broker_id IS NOT NULL)::int + (client_id IS NOT NULL)::int <= 1)
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
CREATE TRIGGER rate_confirmations_updated BEFORE UPDATE ON public.rate_confirmations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS rate_confirmations_prevent_company_change ON public.rate_confirmations;
CREATE TRIGGER rate_confirmations_prevent_company_change BEFORE UPDATE ON public.rate_confirmations FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE OR REPLACE FUNCTION public.default_rate_confirmation_operating_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company public.companies;
BEGIN
  SELECT * INTO v_company FROM public.companies WHERE id = NEW.company_id;
  IF NEW.operating_carrier_name IS NULL THEN NEW.operating_carrier_name := v_company.name; END IF;
  IF NEW.operating_mc_number IS NULL THEN NEW.operating_mc_number := v_company.mc_number; END IF;
  IF NEW.operating_dot_number IS NULL THEN NEW.operating_dot_number := v_company.dot_number; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.default_rate_confirmation_operating_authority() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rate_confirmations_default_authority ON public.rate_confirmations;
CREATE TRIGGER rate_confirmations_default_authority BEFORE INSERT ON public.rate_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.default_rate_confirmation_operating_authority();

ALTER TABLE public.trailer_loads
  ADD COLUMN IF NOT EXISTS tractor_id uuid REFERENCES public.tractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_confirmation_id uuid REFERENCES public.rate_confirmations(id) ON DELETE SET NULL;
ALTER TABLE public.trailer_loads
  ADD COLUMN IF NOT EXISTS haul_type text GENERATED ALWAYS AS (CASE WHEN carrier_id IS NOT NULL THEN 'BROKERED_OUT' ELSE 'INTERNAL' END) STORED;
CREATE INDEX IF NOT EXISTS trailer_loads_tractor_idx ON public.trailer_loads(tractor_id);
CREATE INDEX IF NOT EXISTS trailer_loads_broker_idx ON public.trailer_loads(broker_id);
CREATE INDEX IF NOT EXISTS trailer_loads_rate_confirmation_idx ON public.trailer_loads(rate_confirmation_id);
CREATE INDEX IF NOT EXISTS trailer_loads_haul_type_idx ON public.trailer_loads(haul_type);

CREATE OR REPLACE FUNCTION public.assign_load_parties(
  p_load_id uuid, p_tractor_id uuid DEFAULT NULL, p_broker_id uuid DEFAULT NULL, p_rate_confirmation_id uuid DEFAULT NULL)
RETURNS public.trailer_loads LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to update this load'; END IF;
  SELECT * INTO v_row FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  IF p_tractor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tractors WHERE id = p_tractor_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'tractor belongs to a different organization'; END IF;
  IF p_broker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brokers WHERE id = p_broker_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'broker belongs to a different organization'; END IF;
  IF p_rate_confirmation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rate_confirmations WHERE id = p_rate_confirmation_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'rate confirmation belongs to a different organization'; END IF;
  UPDATE public.trailer_loads
     SET tractor_id = COALESCE(p_tractor_id, tractor_id),
         broker_id = COALESCE(p_broker_id, broker_id),
         rate_confirmation_id = COALESCE(p_rate_confirmation_id, rate_confirmation_id)
   WHERE id = p_load_id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.assign_load_parties(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_load_parties(uuid, uuid, uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.load_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'OTHER',
  file_name text, storage_path text, note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_documents_document_type_check CHECK (document_type IN ('BOL','RATE_CONFIRMATION','POD','LUMPER_RECEIPT','SCALE_TICKET','INSPECTION','INVOICE','OTHER')),
  CONSTRAINT load_documents_has_content CHECK (storage_path IS NOT NULL OR note IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS load_documents_company_idx ON public.load_documents(company_id);
CREATE INDEX IF NOT EXISTS load_documents_load_idx ON public.load_documents(load_id, document_type);
GRANT SELECT, INSERT, DELETE ON public.load_documents TO authenticated;
GRANT ALL ON public.load_documents TO service_role;
ALTER TABLE public.load_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company read load_documents" ON public.load_documents;
CREATE POLICY "company read load_documents" ON public.load_documents FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company insert load_documents" ON public.load_documents;
CREATE POLICY "company insert load_documents" ON public.load_documents FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id()
    AND load_id IN (SELECT id FROM public.trailer_loads WHERE company_id = public.current_company_id()));
DROP POLICY IF EXISTS "company delete load_documents" ON public.load_documents;
CREATE POLICY "company delete load_documents" ON public.load_documents FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE OR REPLACE FUNCTION public.prevent_load_document_reassignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.load_id IS DISTINCT FROM OLD.load_id THEN
    RAISE EXCEPTION 'load_documents rows cannot be reassigned to a different company or load';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_load_document_reassignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS load_documents_prevent_reassignment ON public.load_documents;
CREATE TRIGGER load_documents_prevent_reassignment BEFORE UPDATE ON public.load_documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_load_document_reassignment();

DROP POLICY IF EXISTS "company upload load documents" ON storage.objects;
CREATE POLICY "company upload load documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'load-documents' AND (storage.foldername(name))[1] = public.current_company_id()::text);
DROP POLICY IF EXISTS "company read load documents" ON storage.objects;
CREATE POLICY "company read load documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'load-documents' AND (storage.foldername(name))[1] = public.current_company_id()::text);
DROP POLICY IF EXISTS "company delete load documents" ON storage.objects;
CREATE POLICY "company delete load documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'load-documents' AND (storage.foldername(name))[1] = public.current_company_id()::text AND public.is_dispatcher_or_admin());

ALTER TABLE public.sync_secrets ADD COLUMN IF NOT EXISTS edi_inbound_token text UNIQUE;

CREATE OR REPLACE FUNCTION public.rotate_edi_inbound_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to manage integration tokens'; END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.sync_secrets (company_id, edi_inbound_token) VALUES (v_company, v_token)
  ON CONFLICT (company_id) DO UPDATE SET edi_inbound_token = v_token, updated_at = now();
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.rotate_edi_inbound_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_edi_inbound_token() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_edi_inbound_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to view integration tokens'; END IF;
  SELECT edi_inbound_token INTO v_token FROM public.sync_secrets WHERE company_id = v_company;
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.get_edi_inbound_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_edi_inbound_token() TO authenticated;

CREATE TABLE IF NOT EXISTS public.edi_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction text NOT NULL,
  transaction_set text NOT NULL DEFAULT 'OTHER',
  trading_partner text NOT NULL DEFAULT 'SPS_COMMERCE',
  raw_payload text, parsed jsonb,
  status text NOT NULL DEFAULT 'NEEDS_REVIEW',
  related_load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  in_reply_to uuid REFERENCES public.edi_documents(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edi_documents_direction_check CHECK (direction IN ('IN', 'OUT')),
  CONSTRAINT edi_documents_status_check CHECK (status IN ('NEEDS_REVIEW','REVIEWED','IGNORED','PROMOTED','QUEUED','SENT','FAILED'))
);
CREATE INDEX IF NOT EXISTS edi_documents_company_idx ON public.edi_documents(company_id, direction, status);
CREATE INDEX IF NOT EXISTS edi_documents_load_idx ON public.edi_documents(related_load_id);
GRANT SELECT ON public.edi_documents TO authenticated;
GRANT ALL ON public.edi_documents TO service_role;
ALTER TABLE public.edi_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company read edi_documents" ON public.edi_documents;
CREATE POLICY "company read edi_documents" ON public.edi_documents FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

CREATE OR REPLACE FUNCTION public.set_updated_at_edi_documents()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS edi_documents_updated ON public.edi_documents;
CREATE TRIGGER edi_documents_updated BEFORE UPDATE ON public.edi_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_edi_documents();
REVOKE ALL ON FUNCTION public.set_updated_at_edi_documents() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.review_edi_document(
  p_document_id uuid, p_status text, p_related_load_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS public.edi_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_row public.edi_documents;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to review EDI documents'; END IF;
  IF p_status NOT IN ('REVIEWED', 'IGNORED', 'PROMOTED') THEN RAISE EXCEPTION 'invalid review status'; END IF;
  SELECT * INTO v_row FROM public.edi_documents WHERE id = p_document_id AND company_id = v_company AND direction = 'IN';
  IF NOT FOUND THEN RAISE EXCEPTION 'EDI document not found'; END IF;
  IF p_related_load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trailer_loads WHERE id = p_related_load_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'load belongs to a different organization'; END IF;
  UPDATE public.edi_documents
     SET status = p_status, related_load_id = COALESCE(p_related_load_id, related_load_id), note = COALESCE(p_note, note)
   WHERE id = p_document_id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.review_edi_document(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_edi_document(uuid, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_edi_response(
  p_in_reply_to uuid, p_transaction_set text, p_parsed jsonb DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS public.edi_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_source public.edi_documents; v_row public.edi_documents;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to send EDI responses'; END IF;
  SELECT * INTO v_source FROM public.edi_documents WHERE id = p_in_reply_to AND company_id = v_company AND direction = 'IN';
  IF NOT FOUND THEN RAISE EXCEPTION 'EDI document not found'; END IF;
  INSERT INTO public.edi_documents (company_id, direction, transaction_set, trading_partner, parsed, status, in_reply_to, note, created_by)
  VALUES (v_company, 'OUT', p_transaction_set, v_source.trading_partner, p_parsed, 'QUEUED', p_in_reply_to, p_note, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.queue_edi_response(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_edi_response(uuid, text, jsonb, text) TO authenticated;
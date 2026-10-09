ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS address1 text,
  ADD COLUMN IF NOT EXISTS address2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_load_number text,
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS bol_number text,
  ADD COLUMN IF NOT EXISTS customer_reference text,
  ADD COLUMN IF NOT EXISTS equipment_type text;
CREATE INDEX IF NOT EXISTS orders_company_external_load_idx
  ON public.orders (company_id, lower(external_load_number)) WHERE external_load_number IS NOT NULL;
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS operating_mc_number text,
  ADD COLUMN IF NOT EXISTS operating_dot_number text;
CREATE TABLE IF NOT EXISTS public.order_parties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  party_role       text NOT NULL CHECK (party_role IN ('shipper','customer','broker','operating_carrier')),
  client_id        uuid REFERENCES public.trailer_clients(id) ON DELETE SET NULL,
  name             text NOT NULL,
  mc_number        text,
  dot_number       text,
  email            text,
  phone            text,
  reference_number text,
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','rate_confirmation')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, party_role)
);
CREATE INDEX IF NOT EXISTS order_parties_company_idx ON public.order_parties (company_id);
CREATE OR REPLACE FUNCTION public.order_parties_assert_company()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'order belongs to a different organization';
  END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.trailer_clients c WHERE c.id = NEW.client_id AND c.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'client belongs to a different organization';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_parties_assert_company_trg ON public.order_parties;
CREATE TRIGGER order_parties_assert_company_trg
  BEFORE INSERT OR UPDATE ON public.order_parties
  FOR EACH ROW EXECUTE FUNCTION public.order_parties_assert_company();
REVOKE ALL ON FUNCTION public.order_parties_assert_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.order_parties FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_parties TO authenticated;
GRANT ALL ON public.order_parties TO service_role;
ALTER TABLE public.order_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read order parties" ON public.order_parties;
CREATE POLICY "staff read order parties" ON public.order_parties FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "dispatch write order parties" ON public.order_parties;
CREATE POLICY "dispatch write order parties" ON public.order_parties FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TABLE IF NOT EXISTS public.rate_confirmation_imports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  uploaded_by_user_id   uuid,
  original_filename     text NOT NULL,
  storage_path          text NOT NULL,
  file_hash             text NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  source_type           text NOT NULL DEFAULT 'rate_confirmation' CHECK (source_type IN ('rate_confirmation')),
  extraction_status     text NOT NULL DEFAULT 'uploaded' CHECK (extraction_status IN ('uploaded','extracting','extracted','failed')),
  import_status         text NOT NULL DEFAULT 'pending_review'
                        CHECK (import_status IN ('pending_review','ready','imported','rejected','duplicate','failed')),
  extracted_data        jsonb,
  normalized_data       jsonb,
  confidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides             jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_data            jsonb,
  validation_errors     jsonb NOT NULL DEFAULT '{"errors":[],"warnings":[]}'::jsonb,
  business_key          text,
  duplicate_of_import_id uuid REFERENCES public.rate_confirmation_imports(id) ON DELETE SET NULL,
  order_id              uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  shipment_id           uuid REFERENCES public.shipments(id) ON DELETE SET NULL,
  leg_ids               uuid[],
  trailer_load_id       uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  client_id             uuid REFERENCES public.trailer_clients(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  extracted_at          timestamptz,
  processed_at          timestamptz,
  failed_at             timestamptz,
  failure_reason        text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rc_imports_path_in_company CHECK (storage_path LIKE company_id::text || '/%')
);
CREATE UNIQUE INDEX IF NOT EXISTS rc_imports_company_hash_uniq
  ON public.rate_confirmation_imports (company_id, file_hash) WHERE import_status NOT IN ('rejected','failed');
CREATE INDEX IF NOT EXISTS rc_imports_company_created_idx ON public.rate_confirmation_imports (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rc_imports_company_status_idx  ON public.rate_confirmation_imports (company_id, import_status);
CREATE INDEX IF NOT EXISTS rc_imports_file_hash_idx       ON public.rate_confirmation_imports (file_hash);
CREATE INDEX IF NOT EXISTS rc_imports_business_key_idx    ON public.rate_confirmation_imports (company_id, business_key) WHERE business_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS rc_imports_order_idx           ON public.rate_confirmation_imports (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rc_imports_load_idx            ON public.rate_confirmation_imports (trailer_load_id) WHERE trailer_load_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.rc_imports_guard_keys()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'company_id cannot be changed'; END IF;
  IF NEW.file_hash IS DISTINCT FROM OLD.file_hash OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id THEN
    RAISE EXCEPTION 'upload identity of an import cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rc_imports_guard_keys_trg ON public.rate_confirmation_imports;
CREATE TRIGGER rc_imports_guard_keys_trg BEFORE UPDATE ON public.rate_confirmation_imports
  FOR EACH ROW EXECUTE FUNCTION public.rc_imports_guard_keys();
REVOKE ALL ON FUNCTION public.rc_imports_guard_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rate_confirmation_imports FROM PUBLIC, anon;
GRANT SELECT ON public.rate_confirmation_imports TO authenticated;
GRANT ALL ON public.rate_confirmation_imports TO service_role;
ALTER TABLE public.rate_confirmation_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "operations read rate confirmation imports" ON public.rate_confirmation_imports;
CREATE POLICY "operations read rate confirmation imports" ON public.rate_confirmation_imports
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id()
         AND (public.is_dispatcher_or_admin() OR public.current_user_has_any_role(ARRAY['billing']::public.app_role[])));
DROP POLICY IF EXISTS "company upload rate confirmations" ON storage.objects;
CREATE POLICY "company upload rate confirmations" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rate-confirmations'
              AND (storage.foldername(name))[1] = public.current_company_id()::text
              AND public.is_dispatcher_or_admin());
DROP POLICY IF EXISTS "company read rate confirmations" ON storage.objects;
CREATE POLICY "company read rate confirmations" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rate-confirmations'
         AND (storage.foldername(name))[1] = public.current_company_id()::text
         AND (public.is_dispatcher_or_admin() OR public.current_user_has_any_role(ARRAY['billing']::public.app_role[])));
CREATE OR REPLACE FUNCTION public._jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; v jsonb; r jsonb;
BEGIN
  IF a IS NULL OR jsonb_typeof(a) <> 'object' THEN RETURN coalesce(b, a); END IF;
  IF b IS NULL THEN RETURN a; END IF;
  IF jsonb_typeof(b) <> 'object' THEN RETURN b; END IF;
  r := a;
  FOR k, v IN SELECT * FROM jsonb_each(b) LOOP
    IF jsonb_typeof(v) = 'object' AND jsonb_typeof(r -> k) = 'object' THEN
      r := jsonb_set(r, ARRAY[k], public._jsonb_deep_merge(r -> k, v));
    ELSE
      r := jsonb_set(r, ARRAY[k], v);
    END IF;
  END LOOP;
  RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public._rc_map_equipment_type(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_type IS NULL OR btrim(p_type) = '' THEN NULL
    WHEN lower(p_type) ~ '(reefer|refrigerat)' THEN 'Reefer'
    WHEN lower(p_type) ~ '(flat ?bed)'        THEN 'Flatbed'
    WHEN lower(p_type) ~ '(dry ?van|^van$|53|48)' THEN 'Dry Van'
    ELSE btrim(p_type) END
$$;
CREATE OR REPLACE FUNCTION public._rc_digits(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;
CREATE OR REPLACE FUNCTION public._rc_business_key(p_data jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN ident IS NULL THEN NULL
              ELSE lower(coalesce(public._rc_digits(p_data #>> '{broker,mc_number}'),
                                  nullif(btrim(p_data #>> '{broker,name}'), ''), '')) || '|' || lower(ident) END
  FROM (SELECT coalesce(nullif(btrim(p_data #>> '{load,external_load_number}'), ''),
                        nullif(btrim(p_data #>> '{load,po_number}'), ''),
                        nullif(btrim(p_data #>> '{customer,reference_number}'), ''),
                        nullif(btrim(p_data #>> '{load,confirmation_number}'), '')) AS ident) x
$$;
REVOKE ALL ON FUNCTION public._jsonb_deep_merge(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rc_map_equipment_type(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rc_digits(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rc_business_key(jsonb) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public._rc_validate(p_company uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_err  jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_stop jsonb; v_ord bigint; v_i integer;
  v_seqs integer[] := ARRAY[]::integer[];
  v_n numeric; v_txt text;
  v_lh numeric; v_fuel numeric; v_total numeric; v_acc numeric := 0; v_acc_item jsonb;
  v_start timestamptz; v_end timestamptz;
  v_pickups integer := 0; v_deliveries integer := 0; v_stop_count integer;
  v_first text; v_last text;
  v_model text; v_op_mc text; v_op_dot text; v_eq text; v_mapped text;
  v_ordered jsonb;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('code','no_data','field','','message','No extracted data to validate')),
                              'warnings', '[]'::jsonb, 'valid', false);
  END IF;
  IF nullif(btrim(p_data #>> '{broker,name}'), '') IS NULL AND nullif(btrim(p_data #>> '{customer,name}'), '') IS NULL THEN
    v_err := v_err || jsonb_build_object('code','bill_to_missing','field','broker.name','message','Broker (or customer) name is required');
  END IF;
  IF nullif(btrim(p_data #>> '{broker,mc_number}'), '') IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','broker_mc_missing','field','broker.mc_number','message','Broker MC number is missing');
  END IF;
  IF public._rc_business_key(p_data) IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','load_number_missing','field','load.external_load_number','message','No load, PO, reference or confirmation number found');
  ELSIF nullif(btrim(p_data #>> '{load,external_load_number}'), '') IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','load_number_missing','field','load.external_load_number','message','Broker load number is missing');
  END IF;
  v_txt := p_data #>> '{load,weight_lbs}';
  IF v_txt IS NULL OR jsonb_typeof(p_data #> '{load,weight_lbs}') = 'null' THEN
    v_warn := v_warn || jsonb_build_object('code','weight_missing','field','load.weight_lbs','message','Weight is missing');
  ELSE
    BEGIN v_n := v_txt::numeric; EXCEPTION WHEN others THEN v_n := NULL; END;
    IF v_n IS NULL THEN v_err := v_err || jsonb_build_object('code','weight_invalid','field','load.weight_lbs','message','Weight is not a number');
    ELSIF v_n < 0 THEN v_err := v_err || jsonb_build_object('code','weight_negative','field','load.weight_lbs','message','Weight cannot be negative');
    ELSIF v_n > 99999999 THEN v_err := v_err || jsonb_build_object('code','weight_out_of_range','field','load.weight_lbs','message','Weight is out of range'); END IF;
  END IF;
  v_txt := p_data #>> '{load,pieces}';
  IF v_txt IS NOT NULL AND jsonb_typeof(p_data #> '{load,pieces}') <> 'null' THEN
    BEGIN v_n := v_txt::numeric; EXCEPTION WHEN others THEN v_n := NULL; END;
    IF v_n IS NULL OR v_n <> trunc(v_n) OR v_n < 0 OR v_n > 2147483647 THEN
      v_err := v_err || jsonb_build_object('code','pieces_invalid','field','load.pieces','message','Pieces must be a non-negative whole number');
    END IF;
  END IF;
  v_eq := p_data #>> '{load,equipment_type}';
  v_mapped := public._rc_map_equipment_type(v_eq);
  IF v_mapped IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.equipment e WHERE e.company_id = p_company AND lower(e.equipment_type) = lower(v_mapped)) THEN
    v_warn := v_warn || jsonb_build_object('code','equipment_type_unmatched','field','load.equipment_type',
              'message', format('No %s equipment is on file for this company', v_mapped));
  END IF;
  IF jsonb_typeof(p_data -> 'stops') = 'array' THEN
    v_stop_count := jsonb_array_length(p_data -> 'stops');
    FOR v_stop, v_ord IN SELECT e.value, e.ord FROM jsonb_array_elements(p_data -> 'stops') WITH ORDINALITY AS e(value, ord) LOOP
      v_txt := lower(btrim(coalesce(v_stop ->> 'type', '')));
      IF v_txt = 'pickup' THEN v_pickups := v_pickups + 1;
      ELSIF v_txt = 'delivery' THEN v_deliveries := v_deliveries + 1;
      ELSE v_err := v_err || jsonb_build_object('code','stop_type_invalid','field','stops['||(v_ord-1)||'].type','message','Stop type must be pickup or delivery'); END IF;
      v_txt := v_stop ->> 'sequence';
      IF v_txt IS NULL THEN
        v_warn := v_warn || jsonb_build_object('code','sequence_missing','field','stops['||(v_ord-1)||'].sequence','message','Stop sequence missing; list order is used');
      ELSE
        BEGIN v_i := v_txt::integer; EXCEPTION WHEN others THEN v_i := NULL; END;
        IF v_i IS NULL OR v_i < 1 THEN
          v_err := v_err || jsonb_build_object('code','sequence_invalid','field','stops['||(v_ord-1)||'].sequence','message','Stop sequence must be a positive whole number');
        ELSIF v_i = ANY (v_seqs) THEN
          v_err := v_err || jsonb_build_object('code','sequence_duplicate','field','stops['||(v_ord-1)||'].sequence','message','Duplicate stop sequence');
        ELSE v_seqs := v_seqs || v_i; END IF;
      END IF;
      IF nullif(btrim(v_stop ->> 'facility_name'), '') IS NULL
         AND NOT (nullif(btrim(v_stop ->> 'city'), '') IS NOT NULL AND nullif(btrim(v_stop ->> 'state'), '') IS NOT NULL) THEN
        v_err := v_err || jsonb_build_object('code','stop_location_missing','field','stops['||(v_ord-1)||']','message','Each stop needs a facility name or a city and state');
      ELSIF nullif(btrim(v_stop ->> 'address1'), '') IS NULL THEN
        v_warn := v_warn || jsonb_build_object('code','stop_address_missing','field','stops['||(v_ord-1)||'].address1','message','Street address is missing');
      END IF;
      v_start := NULL; v_end := NULL;
      IF nullif(btrim(v_stop ->> 'appointment_start'), '') IS NOT NULL THEN
        BEGIN v_start := (v_stop ->> 'appointment_start')::timestamptz;
        EXCEPTION WHEN others THEN v_err := v_err || jsonb_build_object('code','appointment_invalid','field','stops['||(v_ord-1)||'].appointment_start','message','Appointment start is not a valid timestamp'); END;
      END IF;
      IF nullif(btrim(v_stop ->> 'appointment_end'), '') IS NOT NULL THEN
        BEGIN v_end := (v_stop ->> 'appointment_end')::timestamptz;
        EXCEPTION WHEN others THEN v_err := v_err || jsonb_build_object('code','appointment_invalid','field','stops['||(v_ord-1)||'].appointment_end','message','Appointment end is not a valid timestamp'); END;
      END IF;
      IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start THEN
        v_err := v_err || jsonb_build_object('code','appointment_order','field','stops['||(v_ord-1)||']','message','Appointment end is before its start');
      ELSIF v_start IS NULL THEN
        v_warn := v_warn || jsonb_build_object('code','appointment_missing','field','stops['||(v_ord-1)||'].appointment_start','message','No appointment time on this stop');
      END IF;
    END LOOP;
    IF v_pickups = 0 THEN v_err := v_err || jsonb_build_object('code','no_pickup','field','stops','message','At least one pickup stop is required'); END IF;
    IF v_deliveries = 0 THEN v_err := v_err || jsonb_build_object('code','no_delivery','field','stops','message','At least one delivery stop is required'); END IF;
    IF v_pickups > 0 AND v_deliveries > 0 AND jsonb_array_length(v_err) = 0 THEN
      SELECT jsonb_agg(s.value ORDER BY coalesce((s.value ->> 'sequence')::int, s.ord::int), s.ord) INTO v_ordered
        FROM jsonb_array_elements(p_data -> 'stops') WITH ORDINALITY AS s(value, ord);
      v_first := lower(v_ordered -> 0 ->> 'type');
      v_last  := lower(v_ordered -> (jsonb_array_length(v_ordered) - 1) ->> 'type');
      IF v_first <> 'pickup' THEN v_err := v_err || jsonb_build_object('code','first_stop_not_pickup','field','stops','message','The first stop must be a pickup'); END IF;
      IF v_last <> 'delivery' THEN v_err := v_err || jsonb_build_object('code','last_stop_not_delivery','field','stops','message','The last stop must be a delivery'); END IF;
    END IF;
  ELSE
    v_err := v_err || jsonb_build_object('code','no_pickup','field','stops','message','At least one pickup stop is required');
    v_err := v_err || jsonb_build_object('code','no_delivery','field','stops','message','At least one delivery stop is required');
  END IF;
  v_txt := coalesce(upper(btrim(p_data #>> '{rate,currency}')), 'USD');
  IF v_txt = '' THEN v_txt := 'USD'; END IF;
  IF v_txt <> 'USD' THEN
    v_err := v_err || jsonb_build_object('code','unsupported_currency','field','rate.currency','message', format('Currency %s is not supported (USD only)', v_txt));
  END IF;
  FOREACH v_txt IN ARRAY ARRAY['linehaul','fuel_surcharge','total'] LOOP
    IF (p_data #>> ARRAY['rate', v_txt]) IS NOT NULL AND jsonb_typeof(p_data #> ARRAY['rate', v_txt]) <> 'null' THEN
      BEGIN v_n := (p_data #>> ARRAY['rate', v_txt])::numeric; EXCEPTION WHEN others THEN v_n := NULL; END;
      IF v_n IS NULL THEN v_err := v_err || jsonb_build_object('code','rate_invalid','field','rate.'||v_txt,'message','Amount is not a number');
      ELSIF v_n < 0 THEN v_err := v_err || jsonb_build_object('code','rate_negative','field','rate.'||v_txt,'message','Amount cannot be negative');
      ELSIF v_n > 99999999 THEN v_err := v_err || jsonb_build_object('code','rate_out_of_range','field','rate.'||v_txt,'message','Amount is out of range');
      ELSIF v_txt = 'linehaul' THEN v_lh := v_n; ELSIF v_txt = 'fuel_surcharge' THEN v_fuel := v_n; ELSE v_total := v_n; END IF;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_data #> '{rate,accessorials}') = 'array' THEN
    FOR v_acc_item IN SELECT value FROM jsonb_array_elements(p_data #> '{rate,accessorials}') LOOP
      BEGIN v_n := (v_acc_item ->> 'amount')::numeric; EXCEPTION WHEN others THEN v_n := NULL; END;
      IF v_n IS NULL THEN v_err := v_err || jsonb_build_object('code','accessorial_invalid','field','rate.accessorials','message','Each accessorial needs a numeric amount');
      ELSIF v_n < 0 THEN v_err := v_err || jsonb_build_object('code','accessorial_negative','field','rate.accessorials','message','Accessorial amounts cannot be negative');
      ELSIF v_n > 99999999 THEN v_err := v_err || jsonb_build_object('code','accessorial_out_of_range','field','rate.accessorials','message','Accessorial amount is out of range');
      ELSE v_acc := v_acc + v_n; END IF;
    END LOOP;
  END IF;
  IF v_lh IS NULL AND v_total IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','no_rate','field','rate','message','No linehaul or total rate found; the load will have no billable rate');
  ELSIF v_lh IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','linehaul_derived','field','rate.linehaul','message','Linehaul missing; it will be derived as total minus fuel and accessorials');
  ELSIF v_total IS NOT NULL AND abs(v_total - (v_lh + coalesce(v_fuel, 0) + v_acc)) > 0.01 THEN
    v_warn := v_warn || jsonb_build_object('code','rate_total_mismatch','field','rate.total','message',
              format('Total %s does not equal linehaul + fuel + accessorials (%s)', v_total, v_lh + coalesce(v_fuel, 0) + v_acc));
  END IF;
  IF v_fuel IS NULL THEN
    v_warn := v_warn || jsonb_build_object('code','fuel_missing','field','rate.fuel_surcharge','message','Fuel surcharge amount is missing');
  END IF;
  SELECT business_model, operating_mc_number, operating_dot_number INTO v_model, v_op_mc, v_op_dot
    FROM public.company_settings WHERE company_id = p_company;
  IF public._rc_digits(p_data #>> '{carrier,mc_number}') IS NOT NULL THEN
    IF public._rc_digits(v_op_mc) IS NULL THEN
      v_warn := v_warn || jsonb_build_object('code','operating_mc_not_configured','field','carrier.mc_number','message','Your operating MC number is not configured, so the carrier on this document cannot be verified');
    ELSIF public._rc_digits(v_op_mc) <> public._rc_digits(p_data #>> '{carrier,mc_number}') THEN
      v_warn := v_warn || jsonb_build_object('code','carrier_mc_mismatch','field','carrier.mc_number','message','The carrier MC on this document does not match your operating MC');
    END IF;
  END IF;
  IF public._rc_digits(p_data #>> '{carrier,dot_number}') IS NOT NULL AND public._rc_digits(v_op_dot) IS NOT NULL
     AND public._rc_digits(v_op_dot) <> public._rc_digits(p_data #>> '{carrier,dot_number}') THEN
    v_warn := v_warn || jsonb_build_object('code','carrier_dot_mismatch','field','carrier.dot_number','message','The carrier DOT on this document does not match your operating DOT');
  END IF;
  IF v_model = 'FREIGHT_BROKER' THEN
    v_warn := v_warn || jsonb_build_object('code','broker_only_company','field','','message','This company is set to FREIGHT_BROKER; imported loads start as own-fleet loads and can be tendered afterwards');
  END IF;
  v_txt := nullif(btrim(p_data #>> '{dispatch,driver_name}'), '');
  IF v_txt IS NOT NULL AND (SELECT count(*) FROM public.drivers d JOIN public.companies c ON c.tenant_id = d.tenant_id
                             WHERE c.id = p_company AND lower(btrim(d.name)) = lower(v_txt)) <> 1 THEN
    v_warn := v_warn || jsonb_build_object('code','driver_unmatched','field','dispatch.driver_name','message','Driver name does not match exactly one driver');
  END IF;
  FOREACH v_txt IN ARRAY ARRAY['tractor_number','trailer_number'] LOOP
    IF nullif(btrim(p_data #>> ARRAY['dispatch', v_txt]), '') IS NOT NULL
       AND (CASE WHEN v_txt = 'tractor_number'
             THEN (SELECT count(*) FROM public.tractors t WHERE t.company_id = p_company
                     AND lower(t.unit_number) = lower(btrim(p_data #>> ARRAY['dispatch', v_txt])))
             ELSE (SELECT count(*) FROM public.equipment e WHERE e.company_id = p_company
                     AND lower(e.equipment_number) = lower(btrim(p_data #>> ARRAY['dispatch', v_txt]))) END) <> 1 THEN
      v_warn := v_warn || jsonb_build_object('code','equipment_unmatched','field','dispatch.'||v_txt,'message','Equipment number does not match exactly one unit');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('errors', v_err, 'warnings', v_warn, 'valid', jsonb_array_length(v_err) = 0);
END $$;
REVOKE ALL ON FUNCTION public._rc_validate(uuid, jsonb) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.register_rate_confirmation_upload(
  p_filename text, p_storage_path text, p_file_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid := public.current_company_id(); v_row public.rate_confirmation_imports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to import rate confirmations'; END IF;
  IF p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'file_hash must be a lowercase SHA-256 hex digest'; END IF;
  IF nullif(btrim(p_filename), '') IS NULL THEN RAISE EXCEPTION 'filename is required'; END IF;
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_company::text || '/%' THEN
    RAISE EXCEPTION 'storage path must be inside your company folder';
  END IF;
  INSERT INTO public.rate_confirmation_imports (company_id, uploaded_by_user_id, original_filename, storage_path, file_hash)
  VALUES (v_company, auth.uid(), btrim(p_filename), p_storage_path, p_file_hash)
  ON CONFLICT (company_id, file_hash) WHERE import_status NOT IN ('rejected','failed') DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate', false, 'import_id', v_row.id, 'import_status', v_row.import_status);
  END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports
   WHERE company_id = v_company AND file_hash = p_file_hash AND import_status NOT IN ('rejected','failed')
   ORDER BY created_at LIMIT 1;
  RETURN jsonb_build_object('duplicate', true, 'import_id', v_row.id, 'import_status', v_row.import_status,
                            'order_id', v_row.order_id, 'shipment_id', v_row.shipment_id, 'trailer_load_id', v_row.trailer_load_id);
END $$;
REVOKE ALL ON FUNCTION public.register_rate_confirmation_upload(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_rate_confirmation_upload(text, text, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_rate_confirmation_extraction(
  p_import_id uuid, p_extracted jsonb, p_normalized jsonb,
  p_confidence jsonb DEFAULT '{}'::jsonb, p_error text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.rate_confirmation_imports; v_final jsonb; v_val jsonb;
BEGIN
  SELECT * INTO v_row FROM public.rate_confirmation_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF v_row.import_status IN ('imported','rejected') THEN
    RAISE EXCEPTION 'Import is already % and cannot be re-extracted', v_row.import_status;
  END IF;
  IF p_error IS NOT NULL THEN
    UPDATE public.rate_confirmation_imports
       SET extraction_status = 'failed', failed_at = now(), failure_reason = p_error, updated_at = now()
     WHERE id = p_import_id;
    RETURN jsonb_build_object('success', false, 'import_id', p_import_id, 'extraction_status', 'failed');
  END IF;
  v_final := public._jsonb_deep_merge(p_normalized, v_row.overrides);
  v_val := public._rc_validate(v_row.company_id, v_final);
  UPDATE public.rate_confirmation_imports
     SET extraction_status = 'extracted', extracted_at = now(), failed_at = NULL, failure_reason = NULL,
         extracted_data = p_extracted, normalized_data = p_normalized,
         confidence = coalesce(p_confidence, '{}'::jsonb), final_data = v_final,
         business_key = public._rc_business_key(v_final),
         validation_errors = v_val - 'valid',
         import_status = CASE WHEN (v_val ->> 'valid')::boolean THEN 'ready' ELSE 'pending_review' END,
         updated_at = now()
   WHERE id = p_import_id;
  RETURN jsonb_build_object('success', true, 'import_id', p_import_id, 'validation', v_val);
END $$;
REVOKE ALL ON FUNCTION public.save_rate_confirmation_extraction(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_rate_confirmation_extraction(uuid, jsonb, jsonb, jsonb, text) TO service_role;
CREATE OR REPLACE FUNCTION public.update_rate_confirmation_review(p_import_id uuid, p_override_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid := public.current_company_id(); v_row public.rate_confirmation_imports;
        v_overrides jsonb; v_final jsonb; v_val jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to review rate confirmations'; END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports WHERE id = p_import_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF v_row.import_status IN ('imported','rejected') THEN RAISE EXCEPTION 'Import is already %', v_row.import_status; END IF;
  IF v_row.extraction_status <> 'extracted' THEN RAISE EXCEPTION 'Extraction has not completed'; END IF;
  v_overrides := public._jsonb_deep_merge(v_row.overrides, coalesce(p_override_data, '{}'::jsonb));
  v_final := public._jsonb_deep_merge(v_row.normalized_data, v_overrides);
  v_val := public._rc_validate(v_company, v_final);
  UPDATE public.rate_confirmation_imports
     SET overrides = v_overrides, final_data = v_final, business_key = public._rc_business_key(v_final),
         validation_errors = v_val - 'valid',
         import_status = CASE WHEN (v_val ->> 'valid')::boolean THEN 'ready' ELSE 'pending_review' END,
         updated_at = now()
   WHERE id = p_import_id;
  RETURN jsonb_build_object('import_id', p_import_id, 'validation', v_val);
END $$;
REVOKE ALL ON FUNCTION public.update_rate_confirmation_review(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rate_confirmation_review(uuid, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.validate_rate_confirmation_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid := public.current_company_id(); v_row public.rate_confirmation_imports; v_val jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to review rate confirmations'; END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports WHERE id = p_import_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF v_row.extraction_status <> 'extracted' THEN RAISE EXCEPTION 'Extraction has not completed'; END IF;
  v_val := public._rc_validate(v_company, public._jsonb_deep_merge(v_row.normalized_data, v_row.overrides));
  IF v_row.import_status NOT IN ('imported','rejected') THEN
    UPDATE public.rate_confirmation_imports
       SET validation_errors = v_val - 'valid',
           import_status = CASE WHEN (v_val ->> 'valid')::boolean THEN 'ready' ELSE 'pending_review' END,
           updated_at = now()
     WHERE id = p_import_id;
  END IF;
  RETURN jsonb_build_object('import_id', p_import_id, 'validation', v_val);
END $$;
REVOKE ALL ON FUNCTION public.validate_rate_confirmation_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_rate_confirmation_import(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reject_rate_confirmation_import(p_import_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid := public.current_company_id(); v_row public.rate_confirmation_imports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company IS NULL OR NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to review rate confirmations'; END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports WHERE id = p_import_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF v_row.import_status = 'imported' THEN RAISE EXCEPTION 'Import is already imported and cannot be rejected'; END IF;
  UPDATE public.rate_confirmation_imports
     SET import_status = 'rejected', failure_reason = p_reason, updated_at = now() WHERE id = p_import_id;
  RETURN jsonb_build_object('import_id', p_import_id, 'import_status', 'rejected');
END $$;
REVOKE ALL ON FUNCTION public.reject_rate_confirmation_import(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_rate_confirmation_import(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_rate_confirmation(
  p_import_id uuid, p_override_data jsonb DEFAULT NULL, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company   uuid := public.current_company_id();
  v_row       public.rate_confirmation_imports;
  v_overrides jsonb; v_final jsonb; v_val jsonb; v_warn jsonb;
  v_ordered   jsonb; v_n integer; v_i integer; v_stop jsonb;
  v_pickup    jsonb; v_delivery jsonb;
  v_broker_name text; v_client_id uuid; v_ident text;
  v_dup_import uuid; v_dup_order uuid;
  v_order_id uuid; v_shipment_id uuid; v_leg_id uuid; v_load public.trailer_loads;
  v_stop_ids uuid[] := ARRAY[]::uuid[]; v_first_id uuid; v_last_id uuid; v_sid uuid;
  v_ready timestamptz; v_req timestamptz;
  v_lh numeric; v_fuel numeric; v_total numeric; v_acc numeric := 0; v_acc_item jsonb;
  v_weight numeric; v_pieces integer; v_apply boolean;
  v_driver_id uuid; v_trailer_eq uuid; v_tractor_eq uuid; v_assign jsonb := '{}'::jsonb; v_other text;
  v_start timestamptz; v_end timestamptz; v_conf text; v_note text;
  v_shipper text; v_cust text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to create loads from rate confirmations'; END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports WHERE id = p_import_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import not found'; END IF;
  IF v_row.import_status = 'imported' THEN
    RETURN jsonb_build_object('success', true, 'already_imported', true, 'import_id', v_row.id,
      'order_id', v_row.order_id, 'shipment_id', v_row.shipment_id, 'leg_ids', to_jsonb(v_row.leg_ids),
      'trailer_load_id', v_row.trailer_load_id, 'client_id', v_row.client_id);
  END IF;
  IF v_row.import_status = 'rejected' THEN RAISE EXCEPTION 'This import was rejected'; END IF;
  IF v_row.extraction_status <> 'extracted' THEN RAISE EXCEPTION 'Extraction has not completed for this import'; END IF;
  v_overrides := public._jsonb_deep_merge(v_row.overrides, coalesce(p_override_data, '{}'::jsonb));
  v_final := public._jsonb_deep_merge(v_row.normalized_data, v_overrides);
  v_val := public._rc_validate(v_company, v_final);
  UPDATE public.rate_confirmation_imports
     SET overrides = v_overrides, final_data = v_final, business_key = public._rc_business_key(v_final),
         validation_errors = v_val - 'valid', updated_at = now(),
         import_status = CASE WHEN (v_val ->> 'valid')::boolean THEN 'ready' ELSE 'pending_review' END
   WHERE id = p_import_id;
  IF NOT (v_val ->> 'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'blocked', true, 'import_id', p_import_id,
                              'errors', v_val -> 'errors', 'warnings', v_val -> 'warnings');
  END IF;
  v_warn := v_val -> 'warnings';
  IF NOT p_force AND public._rc_business_key(v_final) IS NOT NULL THEN
    SELECT i.id INTO v_dup_import FROM public.rate_confirmation_imports i
     WHERE i.company_id = v_company AND i.id <> p_import_id AND i.import_status = 'imported'
       AND i.business_key = public._rc_business_key(v_final) LIMIT 1;
    v_ident := nullif(btrim(v_final #>> '{load,external_load_number}'), '');
    IF v_dup_import IS NULL AND v_ident IS NOT NULL THEN
      SELECT o.id INTO v_dup_order FROM public.orders o
        LEFT JOIN public.order_parties bp ON bp.order_id = o.id AND bp.party_role = 'broker'
       WHERE o.company_id = v_company AND o.status <> 'CANCELLED' AND lower(o.external_load_number) = lower(v_ident)
         AND (bp.id IS NULL OR lower(coalesce(public._rc_digits(bp.mc_number), bp.name)) =
              lower(coalesce(public._rc_digits(v_final #>> '{broker,mc_number}'), nullif(btrim(v_final #>> '{broker,name}'), ''), '')))
       LIMIT 1;
    END IF;
    IF v_dup_import IS NOT NULL OR v_dup_order IS NOT NULL THEN
      UPDATE public.rate_confirmation_imports
         SET import_status = 'duplicate', duplicate_of_import_id = v_dup_import, updated_at = now() WHERE id = p_import_id;
      RETURN jsonb_build_object('success', false, 'duplicate', true, 'import_id', p_import_id,
        'duplicate_of_import_id', v_dup_import, 'existing_order_id', v_dup_order,
        'existing_trailer_load_id', (SELECT trailer_load_id FROM public.rate_confirmation_imports WHERE id = v_dup_import),
        'message', 'A load with the same broker and reference already exists. Re-run with force to import anyway.');
    END IF;
  END IF;
  BEGIN
    SELECT jsonb_agg(s.value ORDER BY coalesce((s.value ->> 'sequence')::int, s.ord::int), s.ord) INTO v_ordered
      FROM jsonb_array_elements(v_final -> 'stops') WITH ORDINALITY AS s(value, ord);
    v_n := jsonb_array_length(v_ordered);
    v_pickup := v_ordered -> 0;
    v_delivery := v_ordered -> (v_n - 1);
    v_broker_name := coalesce(nullif(btrim(v_final #>> '{broker,name}'), ''), nullif(btrim(v_final #>> '{customer,name}'), ''));
    SELECT id INTO v_client_id FROM public.trailer_clients
     WHERE company_id = v_company AND lower(btrim(name)) = lower(v_broker_name) ORDER BY created_at LIMIT 1;
    IF v_client_id IS NULL THEN
      INSERT INTO public.trailer_clients (company_id, name, contact_info, notes)
      VALUES (v_company, v_broker_name,
              nullif(concat_ws(' | ', nullif(v_final #>> '{broker,email}', ''), nullif(v_final #>> '{broker,phone}', ''),
                                CASE WHEN nullif(v_final #>> '{broker,mc_number}', '') IS NOT NULL THEN 'MC ' || (v_final #>> '{broker,mc_number}') END,
                                CASE WHEN nullif(v_final #>> '{broker,dot_number}', '') IS NOT NULL THEN 'DOT ' || (v_final #>> '{broker,dot_number}') END), ''),
              'Created from rate confirmation import')
      RETURNING id INTO v_client_id;
    END IF;
    v_weight := nullif(v_final #>> '{load,weight_lbs}', '')::numeric;
    v_pieces := nullif(v_final #>> '{load,pieces}', '')::numeric::integer;
    v_ready := nullif(v_pickup ->> 'appointment_start', '')::timestamptz;
    v_req   := nullif(v_delivery ->> 'appointment_start', '')::timestamptz;
    SELECT c.order_id, c.shipment_id INTO v_order_id, v_shipment_id
      FROM public.create_order_with_shipment(
             v_client_id, nullif(btrim(v_final #>> '{load,commodity}'), ''), v_weight, v_pieces, NULL, 'STD',
             v_ready, v_req,
             coalesce(nullif(btrim(v_pickup ->> 'facility_name'), ''), concat_ws(', ', v_pickup ->> 'city', v_pickup ->> 'state')),
             nullif(btrim(v_pickup ->> 'location_code'), ''),
             coalesce(nullif(btrim(v_delivery ->> 'facility_name'), ''), concat_ws(', ', v_delivery ->> 'city', v_delivery ->> 'state')),
             nullif(btrim(v_delivery ->> 'location_code'), '')) c;
    SELECT id, origin_stop_id, destination_stop_id INTO v_leg_id, v_first_id, v_last_id
      FROM public.legs WHERE shipment_id = v_shipment_id;
    v_stop_ids := ARRAY[v_first_id];
    FOR v_i IN 1 .. v_n - 2 LOOP
      v_stop := v_ordered -> v_i;
      v_sid := public.add_shipment_stop(v_shipment_id,
                 CASE lower(v_stop ->> 'type') WHEN 'pickup' THEN 'PICKUP'::public.stop_type ELSE 'DELIVERY'::public.stop_type END,
                 nullif(btrim(v_stop ->> 'location_code'), ''),
                 coalesce(nullif(btrim(v_stop ->> 'facility_name'), ''), concat_ws(', ', v_stop ->> 'city', v_stop ->> 'state')),
                 nullif(v_stop ->> 'appointment_start', '')::timestamptz, NULL);
      v_stop_ids := v_stop_ids || v_sid;
    END LOOP;
    v_stop_ids := v_stop_ids || v_last_id;
    IF v_n > 2 THEN
      UPDATE public.stops SET stop_sequence = stop_sequence + 1000 WHERE shipment_id = v_shipment_id;
      FOR v_i IN 1 .. v_n LOOP
        UPDATE public.stops SET stop_sequence = v_i WHERE id = v_stop_ids[v_i];
      END LOOP;
    END IF;
    FOR v_i IN 1 .. v_n LOOP
      v_stop := v_ordered -> (v_i - 1);
      v_start := nullif(v_stop ->> 'appointment_start', '')::timestamptz;
      v_end   := nullif(v_stop ->> 'appointment_end', '')::timestamptz;
      v_conf  := nullif(btrim(v_stop ->> 'appointment_confirmation'), '');
      v_note  := nullif(concat_ws(' | ',
                   CASE WHEN nullif(v_stop ->> 'contact_name', '') IS NOT NULL OR nullif(v_stop ->> 'contact_phone', '') IS NOT NULL
                        THEN 'Contact: ' || concat_ws(' ', nullif(v_stop ->> 'contact_name', ''), nullif(v_stop ->> 'contact_phone', '')) END,
                   nullif(btrim(v_stop ->> 'instructions'), '')), '');
      UPDATE public.stops SET
             earliest_datetime = coalesce(v_start, earliest_datetime), latest_datetime = v_end,
             address1 = nullif(btrim(v_stop ->> 'address1'), ''), address2 = nullif(btrim(v_stop ->> 'address2'), ''),
             city = nullif(btrim(v_stop ->> 'city'), ''), state = nullif(btrim(v_stop ->> 'state'), ''),
             postal_code = nullif(btrim(v_stop ->> 'postal_code'), ''),
             country = coalesce(nullif(btrim(v_stop ->> 'country'), ''), 'US'),
             contact_name = nullif(btrim(v_stop ->> 'contact_name'), ''), contact_phone = nullif(btrim(v_stop ->> 'contact_phone'), ''),
             notes = v_note
       WHERE id = v_stop_ids[v_i];
      IF v_start IS NOT NULL THEN
        INSERT INTO public.appointments (company_id, stop_id, status, scheduled_start, scheduled_end, confirmation_number, confirmed_at)
        VALUES (v_company, v_stop_ids[v_i], CASE WHEN v_conf IS NOT NULL THEN 'CONFIRMED' ELSE 'REQUESTED' END::public.appointment_status,
                v_start, v_end, v_conf, CASE WHEN v_conf IS NOT NULL THEN now() END);
      END IF;
    END LOOP;
    UPDATE public.orders SET
           external_load_number = nullif(btrim(v_final #>> '{load,external_load_number}'), ''),
           po_number = nullif(btrim(v_final #>> '{load,po_number}'), ''),
           bol_number = nullif(btrim(v_final #>> '{load,bol_number}'), ''),
           customer_reference = coalesce(nullif(btrim(v_final #>> '{customer,reference_number}'), ''),
                                         nullif(btrim(v_final #>> '{load,confirmation_number}'), '')),
           equipment_type = public._rc_map_equipment_type(v_final #>> '{load,equipment_type}')
     WHERE id = v_order_id;
    INSERT INTO public.order_parties (company_id, order_id, party_role, client_id, name, mc_number, dot_number, email, phone, source)
    VALUES (v_company, v_order_id, 'broker', v_client_id, v_broker_name,
            nullif(btrim(v_final #>> '{broker,mc_number}'), ''), nullif(btrim(v_final #>> '{broker,dot_number}'), ''),
            nullif(btrim(v_final #>> '{broker,email}'), ''), nullif(btrim(v_final #>> '{broker,phone}'), ''), 'rate_confirmation');
    v_cust := nullif(btrim(v_final #>> '{customer,name}'), '');
    IF v_cust IS NOT NULL THEN
      INSERT INTO public.order_parties (company_id, order_id, party_role, name, reference_number, source)
      VALUES (v_company, v_order_id, 'customer', v_cust, nullif(btrim(v_final #>> '{customer,reference_number}'), ''), 'rate_confirmation');
    END IF;
    v_shipper := coalesce(nullif(btrim(v_final #>> '{shipper,name}'), ''), nullif(btrim(v_pickup ->> 'facility_name'), ''));
    IF v_shipper IS NOT NULL THEN
      INSERT INTO public.order_parties (company_id, order_id, party_role, name, source)
      VALUES (v_company, v_order_id, 'shipper', v_shipper, 'rate_confirmation');
    END IF;
    IF nullif(btrim(v_final #>> '{carrier,name}'), '') IS NOT NULL OR nullif(v_final #>> '{carrier,mc_number}', '') IS NOT NULL THEN
      INSERT INTO public.order_parties (company_id, order_id, party_role, name, mc_number, dot_number, source)
      VALUES (v_company, v_order_id, 'operating_carrier', coalesce(nullif(btrim(v_final #>> '{carrier,name}'), ''), 'Operating carrier'),
              nullif(btrim(v_final #>> '{carrier,mc_number}'), ''), nullif(btrim(v_final #>> '{carrier,dot_number}'), ''), 'rate_confirmation');
    END IF;
    v_apply := coalesce((v_final #>> '{dispatch,apply_assignment}')::boolean, false);
    IF v_apply THEN
      IF nullif(btrim(v_final #>> '{dispatch,driver_name}'), '') IS NOT NULL THEN
        SELECT d.id INTO v_driver_id FROM public.drivers d JOIN public.companies c ON c.tenant_id = d.tenant_id
         WHERE c.id = v_company AND lower(btrim(d.name)) = lower(btrim(v_final #>> '{dispatch,driver_name}'))
           AND (SELECT count(*) FROM public.drivers d2 JOIN public.companies c2 ON c2.tenant_id = d2.tenant_id
                 WHERE c2.id = v_company AND lower(btrim(d2.name)) = lower(btrim(v_final #>> '{dispatch,driver_name}'))) = 1;
      END IF;
      IF nullif(btrim(v_final #>> '{dispatch,trailer_number}'), '') IS NOT NULL THEN
        SELECT e.id INTO v_trailer_eq FROM public.equipment e
         WHERE e.company_id = v_company AND lower(e.equipment_number) = lower(btrim(v_final #>> '{dispatch,trailer_number}'))
           AND (SELECT count(*) FROM public.equipment e2 WHERE e2.company_id = v_company
                 AND lower(e2.equipment_number) = lower(btrim(v_final #>> '{dispatch,trailer_number}'))) = 1;
      END IF;
      IF nullif(btrim(v_final #>> '{dispatch,tractor_number}'), '') IS NOT NULL THEN
        SELECT t.id INTO v_tractor_eq FROM public.tractors t
         WHERE t.company_id = v_company AND lower(t.unit_number) = lower(btrim(v_final #>> '{dispatch,tractor_number}'))
           AND (SELECT count(*) FROM public.tractors t2 WHERE t2.company_id = v_company
                 AND lower(t2.unit_number) = lower(btrim(v_final #>> '{dispatch,tractor_number}'))) = 1;
      END IF;
    END IF;
    v_load := public.plan_leg(v_leg_id, v_driver_id, v_trailer_eq);
    IF v_tractor_eq IS NOT NULL THEN
      SELECT schedule_id INTO v_other FROM public.trailer_loads
       WHERE tractor_id = v_tractor_eq AND id <> v_load.id AND status <> 'Completed' AND superseded_by_id IS NULL LIMIT 1;
      IF v_other IS NULL THEN
        UPDATE public.trailer_loads SET tractor_id = v_tractor_eq WHERE id = v_load.id;
      ELSE
        v_assign := v_assign || jsonb_build_object('tractor_skipped', format('Tractor already assigned to active load %s', v_other));
      END IF;
    END IF;
    v_assign := v_assign || jsonb_build_object('driver_assigned', v_driver_id IS NOT NULL,
                                               'trailer_assigned', v_trailer_eq IS NOT NULL,
                                               'tractor_assigned', v_tractor_eq IS NOT NULL AND v_other IS NULL);
    v_lh    := nullif(v_final #>> '{rate,linehaul}', '')::numeric;
    v_fuel  := nullif(v_final #>> '{rate,fuel_surcharge}', '')::numeric;
    v_total := nullif(v_final #>> '{rate,total}', '')::numeric;
    IF jsonb_typeof(v_final #> '{rate,accessorials}') = 'array' THEN
      FOR v_acc_item IN SELECT value FROM jsonb_array_elements(v_final #> '{rate,accessorials}') LOOP
        v_acc := v_acc + (v_acc_item ->> 'amount')::numeric;
        INSERT INTO public.accessorials (company_id, load_id, code, description, amount, billable_to, created_by)
        VALUES (v_company, v_load.id, coalesce(nullif(upper(btrim(v_acc_item ->> 'code')), ''), 'OTHER'),
                nullif(btrim(v_acc_item ->> 'description'), ''), (v_acc_item ->> 'amount')::numeric, 'CUSTOMER', auth.uid());
      END LOOP;
    END IF;
    IF v_lh IS NULL AND v_total IS NOT NULL THEN v_lh := greatest(v_total - coalesce(v_fuel, 0) - v_acc, 0); END IF;
    UPDATE public.trailer_loads
       SET customer_rate = v_lh, fuel_surcharge_amount = coalesce(v_fuel, 0),
           comments = nullif(btrim(v_final #>> '{load,special_instructions}'), '')
     WHERE id = v_load.id;
    INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, user_id, source)
    VALUES (v_load.id, v_load.outbound_trailer, 'Created from rate confirmation',
            format('%s (import %s)', v_row.original_filename, v_row.id), auth.uid(), 'rate_confirmation');
    UPDATE public.rate_confirmation_imports
       SET import_status = 'imported', processed_at = now(), failed_at = NULL, failure_reason = NULL,
           order_id = v_order_id, shipment_id = v_shipment_id, leg_ids = ARRAY[v_leg_id],
           trailer_load_id = v_load.id, client_id = v_client_id, updated_at = now()
     WHERE id = p_import_id;
    RETURN jsonb_build_object('success', true, 'import_id', p_import_id, 'order_id', v_order_id,
      'shipment_id', v_shipment_id, 'leg_ids', jsonb_build_array(v_leg_id), 'trailer_load_id', v_load.id,
      'client_id', v_client_id, 'operating_mode', 'OWN_FLEET', 'assignment', v_assign, 'warnings', v_warn);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.rate_confirmation_imports
       SET import_status = 'failed', failed_at = now(), failure_reason = SQLERRM, updated_at = now()
     WHERE id = p_import_id;
    RETURN jsonb_build_object('success', false, 'failed', true, 'import_id', p_import_id, 'error', SQLERRM);
  END;
END $$;
REVOKE ALL ON FUNCTION public.import_rate_confirmation(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_rate_confirmation(uuid, jsonb, boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_load_source_document(p_load_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid := public.current_company_id(); v_row public.rate_confirmation_imports;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT (public.is_dispatcher_or_admin() OR public.current_user_has_any_role(ARRAY['billing']::public.app_role[])) THEN
    RAISE EXCEPTION 'You do not have permission to view source documents';
  END IF;
  SELECT * INTO v_row FROM public.rate_confirmation_imports
   WHERE trailer_load_id = p_load_id AND company_id = v_company AND import_status = 'imported' ORDER BY processed_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('import_id', v_row.id, 'source_type', v_row.source_type,
    'original_filename', v_row.original_filename, 'storage_path', v_row.storage_path,
    'uploaded_by_user_id', v_row.uploaded_by_user_id, 'uploaded_at', v_row.created_at, 'imported_at', v_row.processed_at,
    'extracted_data', v_row.extracted_data, 'normalized_data', v_row.normalized_data,
    'manual_corrections', v_row.overrides, 'confidence', v_row.confidence);
END $$;
REVOKE ALL ON FUNCTION public.get_load_source_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_load_source_document(uuid) TO authenticated;
CREATE OR REPLACE VIEW public.load_party_roles WITH (security_invoker = true) AS
SELECT l.id AS load_id, l.company_id, l.order_id, l.shipment_id, l.leg_id, l.schedule_id,
       l.client_id AS bill_to_client_id, bt.name AS bill_to_name,
       (SELECT p.name FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'shipper')   AS shipper_name,
       (SELECT p.name FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'customer')  AS customer_name,
       (SELECT p.name FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'broker')    AS broker_name,
       (SELECT p.mc_number FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'broker') AS broker_mc_number,
       (SELECT p.name FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'operating_carrier') AS operating_carrier_name,
       (SELECT p.mc_number FROM public.order_parties p WHERE p.order_id = l.order_id AND p.party_role = 'operating_carrier') AS operating_carrier_mc_number,
       l.driver_id, l.driver AS driver_name,
       l.tractor_id, t.unit_number AS tractor_number,
       l.equipment_id AS trailer_equipment_id, l.outbound_trailer, l.return_trailer,
       l.carrier_id AS tendered_carrier_id, ca.name AS tendered_carrier_name,
       (SELECT td.status::text FROM public.tenders td WHERE td.leg_id = l.leg_id ORDER BY td.offered_at DESC NULLS LAST LIMIT 1) AS latest_tender_status,
       CASE WHEN l.carrier_id IS NOT NULL THEN 'TENDERED' ELSE 'OWN_FLEET' END AS operating_mode,
       (SELECT i.id FROM public.rate_confirmation_imports i WHERE i.trailer_load_id = l.id AND i.import_status = 'imported'
         ORDER BY i.processed_at DESC LIMIT 1) AS rate_confirmation_import_id
  FROM public.trailer_loads l
  LEFT JOIN public.trailer_clients bt ON bt.id = l.client_id
  LEFT JOIN public.tractors t ON t.id = l.tractor_id
  LEFT JOIN public.carriers ca ON ca.id = l.carrier_id
 WHERE l.superseded_by_id IS NULL;
REVOKE ALL ON public.load_party_roles FROM PUBLIC, anon;
GRANT SELECT ON public.load_party_roles TO authenticated;
GRANT ALL ON public.load_party_roles TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                      AND schemaname = 'public' AND tablename = 'rate_confirmation_imports') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rate_confirmation_imports;
  END IF;
END $$;
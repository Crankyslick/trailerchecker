-- Exception-to-proof foundation for the retail trailer handoff workflow.
-- Additive only: no existing dispatch rows or policies are changed.
-- This migration stores operational evidence and both sides of a broker claim;
-- it does not generate a PDF, issue an invoice, email a carrier, or collect payment.

-- Composite parent key lets child rows prove that their load belongs to the
-- same company as the exception. trailer_loads.id is already a PK; this index
-- exists to support the company-aware foreign key below.
CREATE UNIQUE INDEX IF NOT EXISTS trailer_loads_id_company_uidx
  ON public.trailer_loads (id, company_id);

CREATE TABLE public.exception_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE RESTRICT,
  load_id uuid NOT NULL,
  stop_id uuid REFERENCES public.stops(id) ON DELETE SET NULL,

  exception_type text NOT NULL CHECK (exception_type IN (
    'DETENTION', 'LAYOVER', 'TONU', 'REDELIVERY', 'LUMPER', 'YARD_DWELL',
    'RETURN_TRAILER_MISSING', 'TRAILER_MISMATCH', 'POD_MISSING', 'DAMAGE', 'OTHER'
  )),
  case_status text NOT NULL DEFAULT 'OPEN' CHECK (case_status IN (
    'OPEN', 'EVIDENCE_READY', 'IN_REVIEW', 'RESOLVED', 'WRITTEN_OFF'
  )),
  -- Internal triage only; this is not a legal finding of liability.
  responsible_party text NOT NULL DEFAULT 'UNKNOWN' CHECK (responsible_party IN (
    'SHIPPER', 'CARRIER', 'BROKER', 'SHARED', 'UNKNOWN'
  )),
  trailer_role text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (trailer_role IN (
    'OUTBOUND', 'RETURN', 'NOT_APPLICABLE'
  )),
  trailer_number text,
  facility_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  arrived_at timestamptz,
  departed_at timestamptz,
  free_time_minutes integer CHECK (free_time_minutes IS NULL OR free_time_minutes >= 0),
  carrier_rate_per_hour numeric(12,2) CHECK (carrier_rate_per_hour IS NULL OR carrier_rate_per_hour >= 0),
  customer_rate_per_hour numeric(12,2) CHECK (customer_rate_per_hour IS NULL OR customer_rate_per_hour >= 0),
  description text,

  -- Separate pay-side and bill-side outcomes support asset-based carriers,
  -- brokers and hybrid operators without treating them as the same amount.
  carrier_claim_status text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (carrier_claim_status IN (
    'NOT_APPLICABLE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
    'PARTIALLY_PAID', 'PAID', 'WRITTEN_OFF'
  )),
  customer_claim_status text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (customer_claim_status IN (
    'NOT_APPLICABLE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED',
    'PARTIALLY_PAID', 'PAID', 'WRITTEN_OFF'
  )),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  carrier_amount_claimed numeric(12,2),
  carrier_amount_approved numeric(12,2),
  carrier_amount_paid numeric(12,2),
  customer_amount_claimed numeric(12,2),
  customer_amount_approved numeric(12,2),
  customer_amount_paid numeric(12,2),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exception_cases_id_company_key UNIQUE (id, company_id),
  CONSTRAINT exception_cases_load_company_fk
    FOREIGN KEY (load_id, company_id)
    REFERENCES public.trailer_loads (id, company_id) ON DELETE RESTRICT,
  CONSTRAINT exception_cases_event_time_check
    CHECK (departed_at IS NULL OR arrived_at IS NULL OR departed_at >= arrived_at),
  CONSTRAINT exception_cases_carrier_amounts_check CHECK (
    (carrier_amount_claimed IS NULL OR carrier_amount_claimed >= 0)
    AND (carrier_amount_approved IS NULL OR carrier_amount_approved >= 0)
    AND (carrier_amount_paid IS NULL OR carrier_amount_paid >= 0)
    AND (carrier_amount_approved IS NULL OR
         (carrier_amount_claimed IS NOT NULL AND carrier_amount_approved <= carrier_amount_claimed))
    AND (carrier_amount_paid IS NULL OR
         (carrier_amount_approved IS NOT NULL AND carrier_amount_paid <= carrier_amount_approved))
  ),
  CONSTRAINT exception_cases_customer_amounts_check CHECK (
    (customer_amount_claimed IS NULL OR customer_amount_claimed >= 0)
    AND (customer_amount_approved IS NULL OR customer_amount_approved >= 0)
    AND (customer_amount_paid IS NULL OR customer_amount_paid >= 0)
    AND (customer_amount_approved IS NULL OR
         (customer_amount_claimed IS NOT NULL AND customer_amount_approved <= customer_amount_claimed))
    AND (customer_amount_paid IS NULL OR
         (customer_amount_approved IS NOT NULL AND customer_amount_paid <= customer_amount_approved))
  )
);

CREATE INDEX exception_cases_company_status_idx
  ON public.exception_cases (company_id, case_status, occurred_at DESC);
CREATE INDEX exception_cases_company_type_idx
  ON public.exception_cases (company_id, exception_type, occurred_at DESC);
CREATE INDEX exception_cases_load_idx
  ON public.exception_cases (load_id, created_at DESC);
CREATE INDEX exception_cases_stop_idx
  ON public.exception_cases (stop_id) WHERE stop_id IS NOT NULL;

COMMENT ON TABLE public.exception_cases IS
  'Company-scoped operational exceptions with evidence and independent carrier-pay/customer-bill claim outcomes. A data layer only; no claim is automatically invoiced or sent.';
COMMENT ON COLUMN public.exception_cases.responsible_party IS
  'Internal triage classification only; not a legal determination of fault.';
COMMENT ON COLUMN public.exception_cases.trailer_role IS
  'Identifies the outbound versus store-return trailer involved in the exception.';

-- Private object storage bucket 'exception-evidence' is provisioned outside
-- this migration. Store object keys, never public URLs.
-- Path: company_uuid/exception_case_uuid/file_name.

CREATE TABLE public.exception_case_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN (
    'ARRIVAL_RECORD', 'DEPARTURE_RECORD', 'PHOTO', 'POD', 'BOL', 'RECEIPT',
    'RATE_CONFIRMATION', 'DRIVER_NOTE', 'GATE_NOTE', 'OTHER'
  )),
  capture_source text NOT NULL DEFAULT 'OTHER' CHECK (capture_source IN (
    'DRIVER', 'GUARD', 'DISPATCHER', 'BILLING', 'SYSTEM', 'INTEGRATION', 'OTHER'
  )),
  captured_at timestamptz NOT NULL DEFAULT now(),
  storage_path text,
  note text,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exception_case_evidence_case_company_fk
    FOREIGN KEY (case_id, company_id)
    REFERENCES public.exception_cases (id, company_id) ON DELETE RESTRICT,
  CONSTRAINT exception_case_evidence_has_content_check
    CHECK (storage_path IS NOT NULL OR NULLIF(trim(note), '') IS NOT NULL),
  CONSTRAINT exception_case_evidence_storage_path_check CHECK (
    storage_path IS NULL OR (
      split_part(storage_path, '/', 1) = company_id::text
      AND split_part(storage_path, '/', 2) = case_id::text
      AND split_part(storage_path, '/', 3) NOT IN ('', '.', '..')
      AND array_length(string_to_array(storage_path, '/'), 1) = 3
    )
  ),
  CONSTRAINT exception_case_evidence_unique_object UNIQUE (company_id, storage_path)
);

CREATE INDEX exception_case_evidence_case_idx
  ON public.exception_case_evidence (case_id, captured_at);

COMMENT ON TABLE public.exception_case_evidence IS
  'Append-only evidence metadata for private exception-evidence Storage objects; corrections should be added as new evidence.';
COMMENT ON COLUMN public.exception_case_evidence.storage_path IS
  'Private Storage object key in company_uuid/exception_case_uuid/file_name form; this is not a public URL.';

CREATE TABLE public.exception_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CASE_CREATED', 'CASE_UPDATED', 'EVIDENCE_ADDED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exception_case_events_case_company_fk
    FOREIGN KEY (case_id, company_id)
    REFERENCES public.exception_cases (id, company_id) ON DELETE RESTRICT
);

CREATE INDEX exception_case_events_case_idx
  ON public.exception_case_events (case_id, created_at DESC);

-- Append-only database audit trail for case changes and evidence additions.
CREATE OR REPLACE FUNCTION public.audit_exception_case_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.exception_case_events (company_id, case_id, event_type, details, actor_id)
    VALUES (
      NEW.company_id,
      NEW.id,
      'CASE_CREATED',
      jsonb_build_object(
        'exception_type', NEW.exception_type,
        'load_id', NEW.load_id,
        'stop_id', NEW.stop_id,
        'trailer_role', NEW.trailer_role,
        'trailer_number', NEW.trailer_number,
        'occurred_at', NEW.occurred_at
      ),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.exception_type IS DISTINCT FROM OLD.exception_type THEN
    _changes := _changes || jsonb_build_object('exception_type', jsonb_build_object('from', OLD.exception_type, 'to', NEW.exception_type));
  END IF;
  IF NEW.load_id IS DISTINCT FROM OLD.load_id OR NEW.stop_id IS DISTINCT FROM OLD.stop_id THEN
    _changes := _changes || jsonb_build_object(
      'load_stop',
      jsonb_build_object(
        'from', jsonb_build_object('load_id', OLD.load_id, 'stop_id', OLD.stop_id),
        'to', jsonb_build_object('load_id', NEW.load_id, 'stop_id', NEW.stop_id)
      )
    );
  END IF;
  IF NEW.case_status IS DISTINCT FROM OLD.case_status THEN
    _changes := _changes || jsonb_build_object('case_status', jsonb_build_object('from', OLD.case_status, 'to', NEW.case_status));
  END IF;
  IF NEW.responsible_party IS DISTINCT FROM OLD.responsible_party THEN
    _changes := _changes || jsonb_build_object('responsible_party', jsonb_build_object('from', OLD.responsible_party, 'to', NEW.responsible_party));
  END IF;
  IF NEW.trailer_number IS DISTINCT FROM OLD.trailer_number OR NEW.trailer_role IS DISTINCT FROM OLD.trailer_role THEN
    _changes := _changes || jsonb_build_object(
      'trailer',
      jsonb_build_object(
        'from', jsonb_build_object('role', OLD.trailer_role, 'number', OLD.trailer_number),
        'to', jsonb_build_object('role', NEW.trailer_role, 'number', NEW.trailer_number)
      )
    );
  END IF;
  IF NEW.facility_name IS DISTINCT FROM OLD.facility_name
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at
     OR NEW.departed_at IS DISTINCT FROM OLD.departed_at THEN
    _changes := _changes || jsonb_build_object(
      'event_details',
      jsonb_build_object(
        'from', jsonb_build_object('facility', OLD.facility_name, 'occurred_at', OLD.occurred_at, 'arrived_at', OLD.arrived_at, 'departed_at', OLD.departed_at),
        'to', jsonb_build_object('facility', NEW.facility_name, 'occurred_at', NEW.occurred_at, 'arrived_at', NEW.arrived_at, 'departed_at', NEW.departed_at)
      )
    );
  END IF;
  IF NEW.carrier_claim_status IS DISTINCT FROM OLD.carrier_claim_status
     OR NEW.customer_claim_status IS DISTINCT FROM OLD.customer_claim_status
     OR NEW.carrier_amount_claimed IS DISTINCT FROM OLD.carrier_amount_claimed
     OR NEW.carrier_amount_approved IS DISTINCT FROM OLD.carrier_amount_approved
     OR NEW.carrier_amount_paid IS DISTINCT FROM OLD.carrier_amount_paid
     OR NEW.customer_amount_claimed IS DISTINCT FROM OLD.customer_amount_claimed
     OR NEW.customer_amount_approved IS DISTINCT FROM OLD.customer_amount_approved
     OR NEW.customer_amount_paid IS DISTINCT FROM OLD.customer_amount_paid THEN
    _changes := _changes || jsonb_build_object(
      'claims',
      jsonb_build_object(
        'from', jsonb_build_object(
          'carrier_status', OLD.carrier_claim_status,
          'carrier_claimed', OLD.carrier_amount_claimed,
          'carrier_approved', OLD.carrier_amount_approved,
          'carrier_paid', OLD.carrier_amount_paid,
          'customer_status', OLD.customer_claim_status,
          'customer_claimed', OLD.customer_amount_claimed,
          'customer_approved', OLD.customer_amount_approved,
          'customer_paid', OLD.customer_amount_paid
        ),
        'to', jsonb_build_object(
          'carrier_status', NEW.carrier_claim_status,
          'carrier_claimed', NEW.carrier_amount_claimed,
          'carrier_approved', NEW.carrier_amount_approved,
          'carrier_paid', NEW.carrier_amount_paid,
          'customer_status', NEW.customer_claim_status,
          'customer_claimed', NEW.customer_amount_claimed,
          'customer_approved', NEW.customer_amount_approved,
          'customer_paid', NEW.customer_amount_paid
        )
      )
    );
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    _changes := _changes || jsonb_build_object('description', jsonb_build_object('from', OLD.description, 'to', NEW.description));
  END IF;
  IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    _changes := _changes || jsonb_build_object('metadata', jsonb_build_object('from', OLD.metadata, 'to', NEW.metadata));
  END IF;
  IF NEW.free_time_minutes IS DISTINCT FROM OLD.free_time_minutes
     OR NEW.carrier_rate_per_hour IS DISTINCT FROM OLD.carrier_rate_per_hour
     OR NEW.customer_rate_per_hour IS DISTINCT FROM OLD.customer_rate_per_hour
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code THEN
    _changes := _changes || jsonb_build_object(
      'terms',
      jsonb_build_object(
        'from', jsonb_build_object('free_time_minutes', OLD.free_time_minutes, 'carrier_rate_per_hour', OLD.carrier_rate_per_hour, 'customer_rate_per_hour', OLD.customer_rate_per_hour, 'currency_code', OLD.currency_code),
        'to', jsonb_build_object('free_time_minutes', NEW.free_time_minutes, 'carrier_rate_per_hour', NEW.carrier_rate_per_hour, 'customer_rate_per_hour', NEW.customer_rate_per_hour, 'currency_code', NEW.currency_code)
      )
    );
  END IF;

  IF _changes <> '{}'::jsonb THEN
    INSERT INTO public.exception_case_events (company_id, case_id, event_type, details, actor_id)
    VALUES (NEW.company_id, NEW.id, 'CASE_UPDATED', _changes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_exception_case_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.exception_case_events (company_id, case_id, event_type, details, actor_id)
  VALUES (
    NEW.company_id,
    NEW.case_id,
    'EVIDENCE_ADDED',
    jsonb_build_object(
      'evidence_id', NEW.id,
      'evidence_kind', NEW.evidence_kind,
      'capture_source', NEW.capture_source,
      'captured_at', NEW.captured_at,
      'has_file', NEW.storage_path IS NOT NULL
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.exception_case_exists_for_current_company(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exception_cases c
     WHERE c.id = _case_id
       AND c.company_id = public.current_company_id()
  );
$$;

REVOKE ALL ON FUNCTION public.audit_exception_case_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_exception_case_evidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exception_case_exists_for_current_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exception_case_exists_for_current_company(uuid) TO authenticated;

DROP TRIGGER IF EXISTS exception_cases_audit ON public.exception_cases;
CREATE TRIGGER exception_cases_audit
  AFTER INSERT OR UPDATE ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.audit_exception_case_change();

DROP TRIGGER IF EXISTS exception_case_evidence_audit ON public.exception_case_evidence;
CREATE TRIGGER exception_case_evidence_audit
  AFTER INSERT ON public.exception_case_evidence
  FOR EACH ROW EXECUTE FUNCTION public.audit_exception_case_evidence();

DROP TRIGGER IF EXISTS exception_cases_updated_at ON public.exception_cases;
CREATE TRIGGER exception_cases_updated_at
  BEFORE UPDATE ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS exception_cases_prevent_company_change ON public.exception_cases;
CREATE TRIGGER exception_cases_prevent_company_change
  BEFORE UPDATE OF company_id ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

DROP TRIGGER IF EXISTS exception_case_evidence_prevent_company_change ON public.exception_case_evidence;
CREATE TRIGGER exception_case_evidence_prevent_company_change
  BEFORE UPDATE OF company_id ON public.exception_case_evidence
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

-- A stop must belong to the same company and shipment as its dispatchable load.
CREATE OR REPLACE FUNCTION public.assert_exception_case_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _load_company uuid;
  _load_shipment uuid;
  _stop_company uuid;
  _stop_shipment uuid;
BEGIN
  SELECT l.company_id, l.shipment_id
    INTO _load_company, _load_shipment
    FROM public.trailer_loads l
   WHERE l.id = NEW.load_id;
  IF NOT FOUND OR _load_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'exception load must belong to the selected company';
  END IF;

  IF NEW.stop_id IS NOT NULL THEN
    SELECT s.company_id, s.shipment_id
      INTO _stop_company, _stop_shipment
      FROM public.stops s
     WHERE s.id = NEW.stop_id;
    IF NOT FOUND
       OR _stop_company IS DISTINCT FROM NEW.company_id
       OR _stop_shipment IS DISTINCT FROM _load_shipment THEN
      RAISE EXCEPTION 'exception stop must belong to the load shipment and company';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_exception_case_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS exception_cases_assert_scope ON public.exception_cases;
CREATE TRIGGER exception_cases_assert_scope
  BEFORE INSERT OR UPDATE OF company_id, load_id, stop_id ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.assert_exception_case_scope();

-- Tenant-safe RLS. Guards can append proof to a known case, but cannot read
-- financial case rows, claim outcomes, evidence listings, or the audit log.
ALTER TABLE public.exception_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.exception_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exception_cases TO authenticated;
GRANT INSERT (
  company_id, load_id, stop_id, exception_type, case_status, responsible_party,
  trailer_role, trailer_number, facility_name, occurred_at, arrived_at, departed_at,
  free_time_minutes, carrier_rate_per_hour, customer_rate_per_hour, description,
  carrier_claim_status, customer_claim_status, currency_code,
  carrier_amount_claimed, carrier_amount_approved, carrier_amount_paid,
  customer_amount_claimed, customer_amount_approved, customer_amount_paid, metadata
) ON public.exception_cases TO authenticated;
GRANT UPDATE (
  load_id, stop_id, exception_type, case_status, responsible_party, trailer_role,
  trailer_number, facility_name, occurred_at, arrived_at, departed_at,
  free_time_minutes, carrier_rate_per_hour, customer_rate_per_hour, description,
  carrier_claim_status, customer_claim_status, currency_code,
  carrier_amount_claimed, carrier_amount_approved, carrier_amount_paid,
  customer_amount_claimed, customer_amount_approved, customer_amount_paid, metadata
) ON public.exception_cases TO authenticated;
GRANT ALL ON public.exception_cases TO service_role;

REVOKE ALL ON public.exception_case_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exception_case_evidence TO authenticated;
GRANT INSERT (
  company_id, case_id, evidence_kind, capture_source, captured_at,
  storage_path, note, source_reference, metadata
) ON public.exception_case_evidence TO authenticated;
GRANT ALL ON public.exception_case_evidence TO service_role;

REVOKE ALL ON public.exception_case_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exception_case_events TO authenticated;
GRANT ALL ON public.exception_case_events TO service_role;

DROP POLICY IF EXISTS exception_cases_select_company ON public.exception_cases;
CREATE POLICY exception_cases_select_company
  ON public.exception_cases FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

DROP POLICY IF EXISTS exception_cases_insert_staff ON public.exception_cases;
CREATE POLICY exception_cases_insert_staff
  ON public.exception_cases FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.is_staff());

DROP POLICY IF EXISTS exception_cases_update_staff ON public.exception_cases;
CREATE POLICY exception_cases_update_staff
  ON public.exception_cases FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff())
  WITH CHECK (company_id = public.current_company_id() AND public.is_staff());

DROP POLICY IF EXISTS exception_case_evidence_select_staff ON public.exception_case_evidence;
CREATE POLICY exception_case_evidence_select_staff
  ON public.exception_case_evidence FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

DROP POLICY IF EXISTS exception_case_evidence_insert_company ON public.exception_case_evidence;
CREATE POLICY exception_case_evidence_insert_company
  ON public.exception_case_evidence FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]))
    AND public.exception_case_exists_for_current_company(case_id)
  );

DROP POLICY IF EXISTS exception_case_events_select_staff ON public.exception_case_events;
CREATE POLICY exception_case_events_select_staff
  ON public.exception_case_events FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

-- Private object access is tied to an existing case and company. There are no
-- update/delete policies: replace or correct proof by adding a new evidence row.
DROP POLICY IF EXISTS exception_evidence_objects_select ON storage.objects;
CREATE POLICY exception_evidence_objects_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'exception-evidence'
    AND public.is_staff()
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND EXISTS (
      SELECT 1 FROM public.exception_cases c
       WHERE c.id::text = split_part(storage.objects.name, '/', 2)
         AND c.company_id = public.current_company_id()
         AND split_part(storage.objects.name, '/', 1) = c.company_id::text
    )
  );

DROP POLICY IF EXISTS exception_evidence_objects_insert ON storage.objects;
CREATE POLICY exception_evidence_objects_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exception-evidence'
    AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]))
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 3) NOT IN ('', '.', '..')
    AND split_part(name, '/', 1) = public.current_company_id()::text
    AND public.exception_case_exists_for_current_company(split_part(name, '/', 2)::uuid)
  );

COMMENT ON COLUMN public.exception_cases.carrier_claim_status IS
  'Carrier-pay-side claim state; update only after staff review and reconciliation.';
COMMENT ON COLUMN public.exception_cases.customer_claim_status IS
  'Customer-bill-side claim state; update only after staff review and reconciliation.';
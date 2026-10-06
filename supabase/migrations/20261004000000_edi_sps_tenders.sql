-- ============================================================================
-- EDI inbound/outbound scaffolding — "ability to receive EDI tenders and
-- send actions back to SPS."
--
-- What this honestly is: a receiving dock + review queue, reusing the
-- existing per-company inbound-webhook pattern (sync_secrets.inbound_token /
-- get_inbound_token() / rotate_inbound_token(), already used for the
-- telematics webhook in src/routes/api/public/tracking.ts) for a second,
-- separate EDI secret. Any inbound document — raw X12 or a JSON-wrapped
-- payload — is stored as-received and queued for staff review; nothing is
-- auto-promoted into a tender or a load, because a best-effort parse of an
-- X12 204 without this account's actual trading-partner spec from SPS is a
-- guess, not a fact, and guessing wrong on a load tender is exactly the
-- kind of silent error this system should never produce.
--
-- What this is NOT (yet): actually connected to SPS. The user told us they
-- currently receive 210s (motor carrier freight invoices) through SPS, but
-- not which transport (AS2/VAN vs. SPS's own API) or which trading-partner
-- IDs apply — without that, there is nothing real to wire the "send actions
-- back" direction to. The outbound side here queues a response (e.g. a 990
-- accept/reject) and stores it durably; actually transmitting it to SPS is
-- a follow-up once those account specifics are known, so it isn't built as
-- a guess that would look connected while silently doing nothing.
-- ============================================================================

-- A second, independent per-company inbound secret — kept separate from the
-- telematics webhook's inbound_token so rotating one integration's secret
-- never breaks the other.
ALTER TABLE public.sync_secrets ADD COLUMN IF NOT EXISTS edi_inbound_token text UNIQUE;

CREATE OR REPLACE FUNCTION public.rotate_edi_inbound_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to manage integration tokens';
  END IF;
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
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to view integration tokens';
  END IF;
  SELECT edi_inbound_token INTO v_token FROM public.sync_secrets WHERE company_id = v_company;
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.get_edi_inbound_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_edi_inbound_token() TO authenticated;

-- ---- The documents themselves ----
CREATE TABLE IF NOT EXISTS public.edi_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction text NOT NULL,
  transaction_set text NOT NULL DEFAULT 'OTHER',
  trading_partner text NOT NULL DEFAULT 'SPS_COMMERCE',
  raw_payload text,
  parsed jsonb,
  status text NOT NULL DEFAULT 'NEEDS_REVIEW',
  related_load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  in_reply_to uuid REFERENCES public.edi_documents(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edi_documents_direction_check CHECK (direction IN ('IN', 'OUT')),
  CONSTRAINT edi_documents_status_check CHECK (
    status IN ('NEEDS_REVIEW', 'REVIEWED', 'IGNORED', 'PROMOTED', 'QUEUED', 'SENT', 'FAILED')
  )
);
CREATE INDEX IF NOT EXISTS edi_documents_company_idx ON public.edi_documents(company_id, direction, status);
CREATE INDEX IF NOT EXISTS edi_documents_load_idx ON public.edi_documents(related_load_id);

-- Read-only to the app layer: every write goes through either the inbound
-- route (service_role, bypasses RLS entirely by design — that's how a
-- webhook with no logged-in user can write at all) or the RPCs below, which
-- apply the cross-tenant checks a plain RLS policy can't (e.g. in_reply_to
-- must belong to the caller's own company).
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

-- Staff review action: mark an inbound document reviewed/ignored, and
-- optionally link it to the load/tender it was manually turned into (the
-- human closes the gap an automated parse can't be trusted to close).
CREATE OR REPLACE FUNCTION public.review_edi_document(
  p_document_id uuid,
  p_status text,
  p_related_load_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.edi_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_row     public.edi_documents;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to review EDI documents';
  END IF;
  IF p_status NOT IN ('REVIEWED', 'IGNORED', 'PROMOTED') THEN
    RAISE EXCEPTION 'invalid review status';
  END IF;

  SELECT * INTO v_row FROM public.edi_documents
   WHERE id = p_document_id AND company_id = v_company AND direction = 'IN';
  IF NOT FOUND THEN RAISE EXCEPTION 'EDI document not found'; END IF;

  IF p_related_load_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trailer_loads WHERE id = p_related_load_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'load belongs to a different organization';
  END IF;

  UPDATE public.edi_documents
     SET status = p_status,
         related_load_id = COALESCE(p_related_load_id, related_load_id),
         note = COALESCE(p_note, note)
   WHERE id = p_document_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.review_edi_document(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_edi_document(uuid, text, uuid, text) TO authenticated;

-- Outbound: queue a response (e.g. a 990 accept/reject) against an inbound
-- document. This records intent durably and is where a real SPS send would
-- hook in once this account's outbound transport is known; today nothing
-- automated transmits it, and its status stays 'QUEUED' until something
-- does — never silently marked 'SENT' without actually being sent.
CREATE OR REPLACE FUNCTION public.queue_edi_response(
  p_in_reply_to uuid,
  p_transaction_set text,
  p_parsed jsonb DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.edi_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_source  public.edi_documents;
  v_row     public.edi_documents;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to send EDI responses';
  END IF;

  SELECT * INTO v_source FROM public.edi_documents
   WHERE id = p_in_reply_to AND company_id = v_company AND direction = 'IN';
  IF NOT FOUND THEN RAISE EXCEPTION 'EDI document not found'; END IF;

  INSERT INTO public.edi_documents (
    company_id, direction, transaction_set, trading_partner,
    parsed, status, in_reply_to, note, created_by
  ) VALUES (
    v_company, 'OUT', p_transaction_set, v_source.trading_partner,
    p_parsed, 'QUEUED', p_in_reply_to, p_note, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_edi_response(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_edi_response(uuid, text, jsonb, text) TO authenticated;

-- ============================================================================
-- General document upload for loads (BOL, rate confirmation, POD, receipts,
-- etc.) — "the BOLs and the PDF work for the whole app, the upload where
-- applicable."
--
-- This generalizes the upload pattern already used for exception-case
-- evidence (exception-evidence bucket + exception_case_evidence table) and
-- POD photos (pod-photos bucket) into one reusable primitive attached
-- directly to a load, not gated behind opening an exception case first — so
-- a BOL, a signed rate confirmation, a lumper receipt, or any other document
-- can be attached to any load, any time, from one place.
--
-- A real BOL *PDF* generated from scratch in-app needs a PDF-rendering
-- dependency (pdf-lib, puppeteer, etc.) that cannot be safely added from
-- this environment right now: this project's package.json/bun.lock sync
-- back to a connected Lovable branch, and adding a dependency without
-- running the project's own `bun install` risks a lockfile that doesn't
-- match what ships. What this migration DOES support, with no new
-- dependency: uploading an existing BOL/rate-confirmation/etc. PDF (or
-- photo) from a shipper/driver/dispatcher, AND a browser print-to-PDF BOL
-- view (src/routes/_authenticated/bol.$loadId.tsx) that needs nothing but
-- the browser's own "Print > Save as PDF."
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.load_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
                REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'OTHER',
  file_name text,
  storage_path text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_documents_document_type_check CHECK (
    document_type IN (
      'BOL','RATE_CONFIRMATION','POD','LUMPER_RECEIPT','SCALE_TICKET',
      'INSPECTION','INVOICE','OTHER'
    )
  ),
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
  WITH CHECK (
    company_id = public.current_company_id()
    AND load_id IN (SELECT id FROM public.trailer_loads WHERE company_id = public.current_company_id())
  );
DROP POLICY IF EXISTS "company delete load_documents" ON public.load_documents;
CREATE POLICY "company delete load_documents" ON public.load_documents FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- Row updates never change which company/load a document belongs to.
CREATE OR REPLACE FUNCTION public.prevent_load_document_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.load_id IS DISTINCT FROM OLD.load_id THEN
    RAISE EXCEPTION 'load_documents rows cannot be reassigned to a different company or load';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_load_document_reassignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS load_documents_prevent_reassignment ON public.load_documents;
CREATE TRIGGER load_documents_prevent_reassignment BEFORE UPDATE ON public.load_documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_load_document_reassignment();

-- ---- Storage bucket ----
-- Private bucket for the actual bytes. Path convention, mirroring
-- pod-photos: `${company_id}/${load_id}/${timestamp}-${filename}` — the
-- first path segment is what the policies below check against the caller's
-- own company, same as pod-photos already does.
INSERT INTO storage.buckets (id, name, public)
VALUES ('load-documents', 'load-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company upload load documents" ON storage.objects;
CREATE POLICY "company upload load documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'load-documents'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );
DROP POLICY IF EXISTS "company read load documents" ON storage.objects;
CREATE POLICY "company read load documents" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'load-documents'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );
DROP POLICY IF EXISTS "company delete load documents" ON storage.objects;
CREATE POLICY "company delete load documents" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'load-documents'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
    AND public.is_dispatcher_or_admin()
  );

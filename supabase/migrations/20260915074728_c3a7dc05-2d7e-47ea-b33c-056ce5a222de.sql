-- 1. Harden yard_check_ins ------------------------------------------------
ALTER TABLE public.yard_check_ins
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS trailer_norm text GENERATED ALWAYS AS (upper(btrim(trailer_number))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS yard_check_ins_active_unique
  ON public.yard_check_ins (company_id, trailer_norm)
  WHERE checked_out_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS yard_check_ins_idem_unique
  ON public.yard_check_ins (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS yard_check_ins_load_idx ON public.yard_check_ins (inbound_load_id);

COMMENT ON COLUMN public.trailer_loads.yard_arrival_at IS
  'Canonical yard timer start. Auto-stamped by trigger when return_trailer_location becomes Yard; cleared when the trailer leaves the yard. Never set from client code.';

-- 2. Transactional, idempotent check-in / check-out ------------------------
CREATE OR REPLACE FUNCTION public.yard_check_in(
  p_trailer text,
  p_load_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS public.yard_check_ins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_norm text;
  v_row public.yard_check_ins;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;

  v_norm := upper(btrim(coalesce(p_trailer, '')));
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Trailer number is required';
  END IF;

  IF p_load_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'That load does not belong to your company';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row FROM public.yard_check_ins
     WHERE company_id = v_company AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  SELECT * INTO v_row FROM public.yard_check_ins
   WHERE company_id = v_company AND trailer_norm = v_norm AND checked_out_at IS NULL
   FOR UPDATE
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.yard_check_ins
       SET note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
           inbound_load_id = coalesce(p_load_id, inbound_load_id)
     WHERE id = v_row.id
     RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO public.yard_check_ins (company_id, trailer_number, inbound_load_id, arrival_at, note, idempotency_key)
  VALUES (v_company, v_norm, p_load_id, now(), nullif(btrim(coalesce(p_note, '')), ''), p_idempotency_key)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.yard_check_out(p_id uuid)
RETURNS public.yard_check_ins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row public.yard_check_ins;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;

  UPDATE public.yard_check_ins
     SET checked_out_at = coalesce(checked_out_at, now())
   WHERE id = p_id AND company_id = v_company
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That check-in no longer exists';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.yard_check_in(text, uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.yard_check_out(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.yard_check_in(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.yard_check_out(uuid) TO authenticated;

-- 3. Per-company sites -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  kind text NOT NULL DEFAULT 'yard',
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_sites TO authenticated;
GRANT ALL ON public.company_sites TO service_role;

ALTER TABLE public.company_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_sites_select" ON public.company_sites;
CREATE POLICY "company_sites_select" ON public.company_sites
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "company_sites_write" ON public.company_sites;
CREATE POLICY "company_sites_write" ON public.company_sites
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE UNIQUE INDEX IF NOT EXISTS company_sites_name_unique ON public.company_sites (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS company_sites_one_default ON public.company_sites (company_id) WHERE is_default;

DROP TRIGGER IF EXISTS company_sites_updated_at ON public.company_sites;
CREATE TRIGGER company_sites_updated_at BEFORE UPDATE ON public.company_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS company_sites_lock_company ON public.company_sites;
CREATE TRIGGER company_sites_lock_company BEFORE UPDATE ON public.company_sites
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

INSERT INTO public.company_sites (company_id, name, is_default, kind)
SELECT c.id, s.name, s.is_default, 'yard'
FROM public.companies c
CROSS JOIN (VALUES
  ('589 Chambersburg', true),
  ('Yard 91', false),
  ('Yard 301', false),
  ('Paterson Yard', false)
) AS s(name, is_default)
ON CONFLICT DO NOTHING;
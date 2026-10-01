-- ============================================================================
-- Drayage enhancements. Purely additive — no column dropped, no table
-- renamed, containers/container_events keep every existing field and their
-- tenant_id scoping (matching this table's own established convention,
-- distinct from the company_id scoping the trailer-side tables use since
-- 20260927 — deliberately not unified, they're genuinely different
-- equipment pools: owned trailers vs. third-party chassis pools).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix: containers.client_id references public.clients(id) — a table with no
-- working frontend path to populate it (nothing in this app writes to
-- `clients`; the real customer table everywhere else is trailer_clients).
-- Not touching the old column to avoid any risk to existing rows; adding a
-- working one alongside it instead.
-- ----------------------------------------------------------------------------
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.trailer_clients(id);
CREATE INDEX IF NOT EXISTS containers_customer_idx ON public.containers(customer_id);
COMMENT ON COLUMN public.containers.client_id IS
  'Legacy — references public.clients, which nothing populates. Use customer_id instead.';

-- ----------------------------------------------------------------------------
-- Chassis pool. Previously just a free-text chassis_number field on
-- containers with no availability tracking, no provider, no reuse across
-- moves. chassis_number stays as the legacy/display fallback; chassis_id is
-- the structured pointer going forward, same "add the FK, keep the text
-- column" pattern used for equipment_id/carrier_id on trailer_loads.
-- ----------------------------------------------------------------------------
CREATE TABLE public.chassis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  chassis_number text NOT NULL,
  pool_provider  text,  -- e.g. 'TRAC', 'DCLI', 'Owned'
  status         text NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, IN_USE, MAINTENANCE
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chassis_number)
);
CREATE INDEX chassis_tenant_idx ON public.chassis(tenant_id);

GRANT SELECT, INSERT, UPDATE ON public.chassis TO authenticated;
GRANT ALL ON public.chassis TO service_role;
ALTER TABLE public.chassis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant reads chassis" ON public.chassis FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage'));
CREATE POLICY "dispatchers write chassis" ON public.chassis FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage')
    AND public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage')
    AND public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]));

ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS chassis_id uuid REFERENCES public.chassis(id);
CREATE INDEX IF NOT EXISTS containers_chassis_idx ON public.containers(chassis_id);

-- ----------------------------------------------------------------------------
-- Terminal/port milestones + detention timer. last_free_day (demurrage
-- deadline at the port) and delivered_at/returned_at already existed;
-- discharged_at and picked_up_at were missing, and there was no detention
-- concept at all (the free-time clock at the consignee after delivery,
-- distinct from demurrage at the port).
-- ----------------------------------------------------------------------------
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS discharged_at timestamptz;
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS detention_free_days integer NOT NULL DEFAULT 2;

-- ----------------------------------------------------------------------------
-- log_container_milestone — sets the matching timestamp column and records
-- a structured container_events row in one call, so every milestone click
-- in the UI produces both a queryable timestamp and an audit trail entry,
-- rather than a free-text event with no corresponding field to filter on.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_container_milestone(
  p_container_id uuid,
  p_milestone    text, -- 'DISCHARGED' | 'PICKED_UP' | 'DELIVERED' | 'RETURNED'
  p_note         text DEFAULT NULL
)
RETURNS public.containers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_row    public.containers;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL OR NOT public.tenant_has_product('drayage') THEN
    RAISE EXCEPTION 'Drayage is not active on this account';
  END IF;
  IF NOT public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]) THEN
    RAISE EXCEPTION 'You do not have permission to update this container';
  END IF;

  UPDATE public.containers
     SET discharged_at = CASE WHEN p_milestone = 'DISCHARGED' THEN now() ELSE discharged_at END,
         picked_up_at  = CASE WHEN p_milestone = 'PICKED_UP'  THEN now() ELSE picked_up_at END,
         delivered_at  = CASE WHEN p_milestone = 'DELIVERED'  THEN now() ELSE delivered_at END,
         returned_at   = CASE WHEN p_milestone = 'RETURNED'   THEN now() ELSE returned_at END,
         status = CASE p_milestone
                    WHEN 'DISCHARGED' THEN 'At Port'
                    WHEN 'PICKED_UP'  THEN 'In Transit'
                    WHEN 'DELIVERED'  THEN 'Delivered'
                    WHEN 'RETURNED'   THEN 'Returned'
                    ELSE status
                  END
   WHERE id = p_container_id AND tenant_id = v_tenant
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Container not found';
  END IF;

  INSERT INTO public.container_events (container_id, tenant_id, event_type, note, user_id)
  VALUES (p_container_id, v_tenant, p_milestone, p_note, auth.uid());

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.log_container_milestone(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_container_milestone(uuid, text, text) TO authenticated;
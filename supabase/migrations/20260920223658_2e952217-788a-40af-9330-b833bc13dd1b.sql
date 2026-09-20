CREATE OR REPLACE FUNCTION public.tenant_has_product(_product public.product_key)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_products tp
    WHERE tp.tenant_id = public.current_tenant_id()
      AND tp.product = _product
      AND tp.status <> 'cancelled'
      AND (tp.status <> 'trial' OR tp.trial_ends_at IS NULL OR tp.trial_ends_at > now())
  )
$$;

REVOKE ALL ON FUNCTION public.tenant_has_product(public.product_key) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_product(public.product_key) TO authenticated;
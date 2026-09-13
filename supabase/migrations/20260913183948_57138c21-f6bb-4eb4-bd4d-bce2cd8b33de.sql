
CREATE TYPE public.product_key AS ENUM ('trailer', 'drayage');

CREATE TABLE public.tenant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product public.product_key NOT NULL,
  status text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_products TO authenticated;
GRANT ALL ON public.tenant_products TO service_role;

ALTER TABLE public.tenant_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own tenant products"
  ON public.tenant_products FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "owners add tenant products"
  ON public.tenant_products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "owners update tenant products"
  ON public.tenant_products FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "owners remove tenant products"
  ON public.tenant_products FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE TRIGGER tenant_products_set_updated_at
  BEFORE UPDATE ON public.tenant_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_products_lock_tenant
  BEFORE UPDATE ON public.tenant_products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

CREATE INDEX idx_tenant_products_tenant ON public.tenant_products(tenant_id);

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
  )
$$;

REVOKE ALL ON FUNCTION public.tenant_has_product(public.product_key) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_product(public.product_key) TO authenticated;

-- Existing organizations keep access to everything they have today.
INSERT INTO public.tenant_products (tenant_id, product, status)
SELECT t.id, p.product, 'active'
FROM public.tenants t
CROSS JOIN (SELECT unnest(enum_range(NULL::public.product_key)) AS product) p
ON CONFLICT (tenant_id, product) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _tenant uuid;
  _company uuid;
  _name text;
  _invite public.tenant_invites%ROWTYPE;
  _products text;
  _product text;
BEGIN
  SELECT p.tenant_id INTO _tenant FROM public.profiles p WHERE p.id = NEW.id;
  IF _tenant IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _invite FROM public.tenant_invites i
  WHERE lower(i.email) = lower(COALESCE(NEW.email, ''))
    AND i.accepted_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.profiles (id, tenant_id, email, full_name)
    VALUES (NEW.id, _invite.tenant_id, NEW.email,
            COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email))
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email;

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _invite.role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.tenant_invites SET accepted_at = now() WHERE id = _invite.id;
    RETURN NEW;
  END IF;

  _name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(COALESCE(NEW.email, 'new user'), '@', 1)
  );

  INSERT INTO public.tenants (name) VALUES (_name) RETURNING id INTO _tenant;

  INSERT INTO public.companies (name, tenant_id)
  VALUES (_name, _tenant)
  RETURNING id INTO _company;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, _tenant, NEW.email, COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email))
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Products chosen on the sign-up page, e.g. "trailer" or "trailer,drayage".
  _products := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'products'), ''), 'trailer');
  FOREACH _product IN ARRAY string_to_array(_products, ',')
  LOOP
    _product := trim(_product);
    IF _product IN ('trailer', 'drayage') THEN
      INSERT INTO public.tenant_products (tenant_id, product, status, trial_ends_at)
      VALUES (_tenant, _product::public.product_key, 'trial', now() + interval '14 days')
      ON CONFLICT (tenant_id, product) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'onboarding failed for user % (%): %', NEW.id, NEW.email, SQLERRM;
END;
$function$;

CREATE TABLE public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  email text not null,
  role public.app_role not null,
  invited_by uuid references auth.users(id),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (tenant_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invites TO authenticated;
GRANT ALL ON public.tenant_invites TO service_role;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their tenant invites"
  ON public.tenant_invites FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "Admins can create invites for their tenant"
  ON public.tenant_invites FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[])
         AND role <> 'owner'::public.app_role);

CREATE POLICY "Admins can update their tenant invites"
  ON public.tenant_invites FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "Admins can revoke their tenant invites"
  ON public.tenant_invites FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE TRIGGER tenant_invites_prevent_tenant_change
  BEFORE UPDATE ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid;
  _company uuid;
  _name text;
  _invite public.tenant_invites%ROWTYPE;
BEGIN
  SELECT p.tenant_id INTO _tenant FROM public.profiles p WHERE p.id = NEW.id;
  IF _tenant IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pending invite for this email? Join that tenant with the invited role.
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

  -- No invite: create a fresh tenant for this signup.
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

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'onboarding failed for user % (%): %', NEW.id, NEW.email, SQLERRM;
END;
$function$;
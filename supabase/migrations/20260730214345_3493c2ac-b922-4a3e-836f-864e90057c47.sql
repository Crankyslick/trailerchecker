GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "admins assign roles in org" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.org_id = public.current_org_id())
  );

CREATE POLICY "admins update roles in org" ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.org_id = public.current_org_id())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.org_id = public.current_org_id())
  );

CREATE POLICY "admins remove roles in org" ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND user_id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.org_id = public.current_org_id())
  );
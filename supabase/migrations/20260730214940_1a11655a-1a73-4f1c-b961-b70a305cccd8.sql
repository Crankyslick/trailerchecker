-- handle_new_user is only ever invoked by the auth trigger; no client should call it.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Allow admins to correct/remove erroneous audit rows within their own organization.
GRANT UPDATE, DELETE ON public.trailer_events TO authenticated;

CREATE POLICY "admins correct org trailer events" ON public.trailer_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND org_id = public.current_org_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND org_id = public.current_org_id());

CREATE POLICY "admins remove org trailer events" ON public.trailer_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND org_id = public.current_org_id());
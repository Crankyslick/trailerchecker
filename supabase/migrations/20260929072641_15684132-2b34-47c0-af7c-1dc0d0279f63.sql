ALTER PUBLICATION supabase_realtime ADD TABLE public.trailer_loads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trailer_events;
CREATE POLICY "driver reads own load events" ON public.trailer_events FOR SELECT TO authenticated
  USING (load_id IN (SELECT l.id FROM public.trailer_loads l JOIN public.drivers d ON d.id = l.driver_id WHERE d.user_id = auth.uid()));
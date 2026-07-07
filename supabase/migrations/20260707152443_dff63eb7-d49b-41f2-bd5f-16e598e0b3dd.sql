CREATE UNIQUE INDEX IF NOT EXISTS loads_target_load_id_uniq
  ON public.loads (target_load_id)
  WHERE target_load_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS loads_schedule_trip_uniq
  ON public.loads (schedule_id, trip_id)
  WHERE target_load_id IS NULL;
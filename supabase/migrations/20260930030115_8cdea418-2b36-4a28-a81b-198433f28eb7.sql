DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carriers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.carriers';
  END IF;
END $$;
ALTER TABLE public.carriers REPLICA IDENTITY FULL;
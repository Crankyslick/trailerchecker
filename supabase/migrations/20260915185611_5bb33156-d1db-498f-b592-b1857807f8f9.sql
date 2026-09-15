CREATE TABLE public.sync_secrets (
  id uuid not null default gen_random_uuid() primary key,
  company_id uuid not null unique references public.companies(id),
  webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT ALL ON public.sync_secrets TO service_role;
ALTER TABLE public.sync_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sync_secrets_updated_at BEFORE UPDATE ON public.sync_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sync_secrets (company_id, webhook_url)
SELECT company_id, webhook_url FROM public.trailer_sync_config
WHERE webhook_url IS NOT NULL
ON CONFLICT (company_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url;

ALTER TABLE public.trailer_sync_config DROP COLUMN webhook_url;

CREATE OR REPLACE FUNCTION public.admin_sync_config()
RETURNS TABLE (spreadsheet_id text, sheet_name text, webhook_url text, last_synced_at timestamptz, last_sync_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.spreadsheet_id, c.sheet_name, s.webhook_url, c.last_synced_at, c.last_sync_status
  FROM public.trailer_sync_config c
  LEFT JOIN public.sync_secrets s ON s.company_id = c.company_id
  WHERE c.company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin')
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.admin_sync_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_sync_config(p_spreadsheet_id text, p_sheet_name text, p_webhook_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company uuid := public.current_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change sync settings';
  END IF;
  UPDATE public.trailer_sync_config
     SET spreadsheet_id = p_spreadsheet_id,
         sheet_name = p_sheet_name
   WHERE company_id = v_company;
  IF NOT FOUND THEN
    INSERT INTO public.trailer_sync_config (company_id, spreadsheet_id, sheet_name)
    VALUES (v_company, p_spreadsheet_id, p_sheet_name);
  END IF;
  INSERT INTO public.sync_secrets (company_id, webhook_url)
  VALUES (v_company, p_webhook_url)
  ON CONFLICT (company_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_save_sync_config(text, text, text) TO authenticated;
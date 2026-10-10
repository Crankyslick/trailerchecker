import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reads an uploaded rate confirmation (as the signed-in user, so storage RLS
 * applies), extracts fields with AI, and stores them on the review row.
 * Nothing becomes a load here — a dispatcher must review and confirm.
 */
export const extractRateConfirmationImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("rate_confirmation_imports")
      .select("id, storage_path, original_filename, import_status")
      .eq("id", data.importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Import not found");
    if (row.import_status === "imported" || row.import_status === "rejected")
      throw new Error(`This import is already ${row.import_status}`);

    const file = await context.supabase.storage.from("rate-confirmations").download(row.storage_path);
    if (file.error || !file.data) throw new Error("Could not read the uploaded file");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractRateConfirmation, ExtractionError } = await import("@/lib/rate-confirmation-extract.server");
    const { normalizeRateConfirmation } = await import("@/lib/rate-confirmation");
    try {
      const out = await extractRateConfirmation(b64, row.original_filename);
      const normalized = normalizeRateConfirmation(out.data);
      const { data: res, error: saveErr } = await supabaseAdmin.rpc("save_rate_confirmation_extraction", {
        p_import_id: row.id,
        p_extracted: out.raw as never,
        p_normalized: normalized as never,
        p_confidence: out.confidence as never,
      });
      if (saveErr) throw new Error(saveErr.message);
      return { ok: true as const, result: res };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      // Rate limits / credit issues are not saved as a document failure, so the user can retry later.
      const status = e instanceof ExtractionError ? e.status : 500;
      if (status !== 429 && status !== 402) {
        await supabaseAdmin.rpc("save_rate_confirmation_extraction", {
          p_import_id: row.id,
          p_extracted: null as never,
          p_normalized: null as never,
          p_error: msg,
        });
      }
      return { ok: false as const, error: msg };
    }
  });

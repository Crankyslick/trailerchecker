import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractRateConfirmationImport } from "@/lib/rate-confirmation.functions";

type Issue = { code: string; field: string; message: string };
type ImportRow = {
  id: string;
  original_filename: string;
  extraction_status: string;
  import_status: string;
  final_data: Record<string, any> | null;
  validation_errors: { errors: Issue[]; warnings: Issue[] } | null;
  failure_reason: string | null;
  trailer_load_id: string | null;
  created_at: string;
};

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function useImports() {
  return useQuery({
    queryKey: ["rc-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_confirmation_imports")
        .select("id, original_filename, extraction_status, import_status, final_data, validation_errors, failure_reason, trailer_load_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ImportRow[];
    },
  });
}

export function RateConfirmationImport({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const extract = useServerFn(extractRateConfirmationImport);
  const { data: imports } = useImports();
  const [openId, setOpenId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["rc-imports"] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") throw new Error("Please choose a PDF file");
      if (file.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB");
      const buf = await file.arrayBuffer();
      const hash = await sha256(buf);
      const { data: company } = await supabase.from("companies").select("id").limit(1).maybeSingle();
      if (!company) throw new Error("No company is linked to your account");
      const path = `${company.id}/${hash}.pdf`;
      const up = await supabase.storage.from("rate-confirmations").upload(path, file, { upsert: false, contentType: "application/pdf" });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
      const { data: reg, error } = await supabase.rpc("register_rate_confirmation_upload", {
        p_filename: file.name, p_storage_path: path, p_file_hash: hash,
      });
      if (error) throw new Error(error.message);
      const r = reg as { import_id: string; duplicate: boolean };
      if (r.duplicate) { toast.info("This file was already uploaded"); return r.import_id; }
      await refresh();
      const res = await extract({ data: { importId: r.import_id } });
      if (!res.ok) toast.error(res.error);
      return r.import_id;
    },
    onSuccess: (id) => { setOpenId(id); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = imports?.find((i) => i.id === openId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Import rate confirmation</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a broker's rate confirmation PDF. We read it for you; nothing becomes a load until you review and confirm.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-sm hover:bg-muted/40">
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {upload.isPending ? "Uploading and reading…" : "Choose PDF"}
          <input type="file" accept="application/pdf" className="hidden" disabled={upload.isPending}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
        </label>

        {open ? (
          <ReviewPanel row={open} onBack={() => setOpenId(null)} onChanged={refresh}
            onRetry={async () => { const r = await extract({ data: { importId: open.id } }); if (!r.ok) toast.error(r.error); refresh(); }} />
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Recent imports</h3>
            {(imports ?? []).length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {(imports ?? []).map((i) => (
              <button key={i.id} onClick={() => setOpenId(i.id)}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40">
                <span className="truncate">{i.original_filename}</span>
                <span className="text-xs text-muted-foreground">{statusLabel(i)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabel(i: ImportRow) {
  if (i.extraction_status === "failed") return "Couldn't read";
  if (i.extraction_status !== "extracted") return "Reading…";
  return ({ pending_review: "Needs review", ready: "Ready", imported: "Load created", rejected: "Rejected", duplicate: "Possible duplicate", failed: "Failed" } as Record<string, string>)[i.import_status] ?? i.import_status;
}

const FIELDS: [string, string][] = [
  ["broker.name", "Broker"], ["broker.mc_number", "Broker MC"], ["load.external_load_number", "Broker load #"],
  ["load.po_number", "PO #"], ["load.commodity", "Commodity"], ["load.weight_lbs", "Weight (lbs)"],
  ["load.equipment_type", "Equipment"], ["rate.linehaul", "Linehaul ($)"], ["rate.fuel_surcharge", "Fuel ($)"],
  ["rate.total", "Total ($)"], ["dispatch.driver_name", "Driver"], ["dispatch.tractor_number", "Truck #"],
  ["dispatch.trailer_number", "Trailer #"],
];
const NUMERIC = new Set(["load.weight_lbs", "rate.linehaul", "rate.fuel_surcharge", "rate.total"]);
const get = (o: any, p: string) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(p: string, v: unknown) {
  const [a, b] = p.split(".");
  return { [a]: { [b]: v } };
}

function ReviewPanel({ row, onBack, onChanged, onRetry }: { row: ImportRow; onBack: () => void; onChanged: () => void; onRetry: () => void }) {
  const d = row.final_data ?? {};
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = row.import_status === "imported" || row.import_status === "rejected";

  const overrides = () => {
    let o: Record<string, any> = {};
    for (const [k, v] of Object.entries(edits)) {
      const val = v.trim() === "" ? null : NUMERIC.has(k) ? Number(v) : v;
      const piece = setPath(k, val);
      const top = Object.keys(piece)[0];
      o = { ...o, [top]: { ...(o[top] ?? {}), ...piece[top] } };
    }
    if (apply) o.dispatch = { ...(o.dispatch ?? {}), apply_assignment: true };
    return o;
  };

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); onChanged(); } };

  const save = () => run(async () => {
    const { error } = await supabase.rpc("update_rate_confirmation_review", { p_import_id: row.id, p_override_data: overrides() });
    if (error) throw new Error(error.message);
    setEdits({}); toast.success("Saved");
  });
  const create = (force = false) => run(async () => {
    const { data, error } = await supabase.rpc("import_rate_confirmation", { p_import_id: row.id, p_override_data: overrides(), p_force: force });
    if (error) throw new Error(error.message);
    const r = data as any;
    if (r.success) { toast.success("Load created"); setEdits({}); }
    else if (r.duplicate) {
      if (confirm(`${r.message}\n\nCreate it anyway?`)) await create(true);
    } else if (r.blocked) toast.error("Fix the errors listed before creating the load");
    else toast.error(r.error ?? "Could not create the load");
  });
  const reject = () => run(async () => {
    const { error } = await supabase.rpc("reject_rate_confirmation_import", { p_import_id: row.id, p_reason: "Rejected by reviewer" });
    if (error) throw new Error(error.message);
  });

  const errs = row.validation_errors?.errors ?? [];
  const warns = row.validation_errors?.warnings ?? [];
  const stops: any[] = Array.isArray(d.stops) ? d.stops : [];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:underline">← All imports</button>
      <div className="flex items-center justify-between">
        <div className="font-medium truncate">{row.original_filename}</div>
        <span className="text-xs text-muted-foreground">{statusLabel(row)}</span>
      </div>
      {row.extraction_status === "failed" && (
        <div className="rounded-md border border-destructive/40 p-3 text-sm">
          We couldn't read this file: {row.failure_reason}
          <button onClick={onRetry} className="ml-2 underline">Try again</button>
        </div>
      )}
      {row.extraction_status === "extracted" && (
        <>
          {errs.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm">
              {errs.map((e, i) => <li key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-destructive shrink-0" />{e.message}</li>)}
            </ul>
          )}
          {warns.length > 0 && (
            <ul className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground">
              {warns.map((e, i) => <li key={i}>• {e.message}</li>)}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="text-xs space-y-1">
                <span className="text-muted-foreground">{label}</span>
                <input disabled={locked}
                  value={edits[k] ?? (get(d, k) ?? "").toString()}
                  onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Stops</h4>
            {stops.map((s, i) => (
              <div key={i} className="rounded border border-border px-3 py-2 text-xs">
                <span className="font-medium uppercase">{s.type}</span> · {s.facility_name ?? "—"} · {[s.city, s.state].filter(Boolean).join(", ")}
                {s.appointment_start && <span className="text-muted-foreground"> · {new Date(s.appointment_start).toLocaleString()}</span>}
              </div>
            ))}
          </div>
          {!locked && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
                Also assign the driver, truck and trailer named above (only exact matches)
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => create()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                  {busy ? "Working…" : "Create load"}
                </button>
                <button disabled={busy || Object.keys(edits).length === 0} onClick={save} className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50">Save changes</button>
                <button disabled={busy} onClick={reject} className="rounded-md border border-border px-3 py-1.5 text-sm text-destructive">Reject</button>
              </div>
            </>
          )}
          {row.import_status === "imported" && (
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />Load created — it now appears in the planning list.</p>
          )}
        </>
      )}
    </div>
  );
}

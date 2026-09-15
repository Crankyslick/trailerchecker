import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, TestTube2, Loader2, Check, Package, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { useSheetSyncStatus, useDrainSheetOutbox } from "@/hooks/use-sheet-sync";
import { describeEntry, discardOutboxEntry, requeueAllFailed, requeueOutboxEntry } from "@/lib/sheet-outbox";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { invalidateWebhookCache } from "@/lib/webhook";
import { getSheetHeaders } from "@/lib/sheets.functions";
import { toast } from "sonner";
import { PRODUCTS, type ProductKey } from "@/lib/products";
import { useTenantProducts } from "@/hooks/use-products";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: guard({ roles: ["owner", "admin"] }),
  head: () => ({ meta: [{ title: "Settings — Me Do Logistics" }] }),
  component: SettingsPage,
});

// Try to auto-extract a spreadsheet ID if the user pastes a full URL.
function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}

function SettingsPage() {
  const [webhook, setWebhook] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [complianceHours, setComplianceHours] = useState(24);
  const [testing, setTesting] = useState(false);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const readHeaders = useServerFn(getSheetHeaders);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sync_config").select("webhook_url, spreadsheet_id, sheet_name").eq("id", 1).maybeSingle();
      const row = data as { webhook_url: string | null; spreadsheet_id: string | null; sheet_name: string | null } | null;
      if (row) {
        setWebhook(row.webhook_url ?? "");
        setSpreadsheetId(row.spreadsheet_id ?? "");
        setSheetName(row.sheet_name ?? "Sheet1");
      }
    })();
  }, []);

  async function save() {
    const cleanId = extractSpreadsheetId(spreadsheetId);
    const { error } = await supabase.from("sync_config").update({
      webhook_url: webhook || null,
      spreadsheet_id: cleanId || null,
      sheet_name: sheetName || "Sheet1",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) toast.error(error.message);
    else { setSpreadsheetId(cleanId); toast.success("Settings saved"); invalidateWebhookCache(); }
  }

  async function testConnection() {
    setTesting(true);
    setHeaders(null);
    try {
      const res = await readHeaders();
      if (res.headers.length === 0) {
        toast.warning(res.warnings[0] ?? "No headers found in the sheet.");
      } else {
        setHeaders(res.headers);
        toast.success(`Connected · resolved ${res.headers.length} columns from "${res.sheet_name}"`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><SettingsIcon className="h-6 w-6 text-primary" /> Settings</h1>
        <p className="text-sm text-muted-foreground">Compliance thresholds and bidirectional Google Sheet sync.</p>
      </div>
      <ProductsCard />

      <div className="kpi-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Compliance Rule</h2>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Yard Turnaround Limit (hours)</span>
          <input type="number" min={1} value={complianceHours} onChange={(e) => setComplianceHours(Number(e.target.value))}
            className="mt-1 w-40 bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/50" />
        </label>
        <p className="text-xs text-muted-foreground">Default 24h. Countdown timers on the Control Tower use this value.</p>
      </div>

      <div className="kpi-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Google Sheet Sync</h2>
        <p className="text-xs text-muted-foreground">
          Bidirectional sync via connector gateway. Columns are resolved dynamically by header name
          (case-insensitive), so re-ordering columns in the sheet will not break writebacks.
        </p>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Spreadsheet ID or URL</span>
          <input value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…  (or just the ID)"
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Sheet / Tab Name</span>
          <input value={sheetName} onChange={(e) => setSheetName(e.target.value)}
            placeholder="Sheet1"
            className="mt-1 w-64 bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Legacy Webhook URL (optional)</span>
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={testConnection} disabled={testing || !spreadsheetId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 text-primary text-sm hover:bg-primary/10 disabled:opacity-50">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />} Test & Load Headers
          </button>
          <button onClick={save} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            Save Settings
          </button>
        </div>

        {headers && (
          <div className="rounded-md border border-border bg-surface-2/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Detected columns ({headers.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {headers.map((h, i) => (
                <span key={`${h}-${i}`} className="chip border bg-primary/10 text-primary border-primary/30 font-mono text-[11px]">
                  {String.fromCharCode(65 + (i % 26))} · {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <SyncQueueCard />

      <div className="kpi-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Billing & Plans</h2>
          <p className="text-xs text-muted-foreground">Choose the plan that fits your team. Billed per user, per month.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { name: "Professional", price: "$40", unit: "per user / month", blurb: "Single yard, full dispatch board and compliance ticker." },
            { name: "Business", price: "$65", unit: "per user / month", blurb: "Multi-yard, roles, sheet sync, and reporting.", featured: true },
            { name: "Enterprise", price: "Custom", unit: "quote", blurb: "SSO, API integrations, SLA, and onboarding support." },
          ].map((p) => (
            <div key={p.name} className={`rounded-md border p-4 ${p.featured ? "border-primary/50 bg-primary/5" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{p.name}</span>
                {p.featured && <span className="chip border border-primary/30 bg-primary/15 text-primary">Popular</span>}
              </div>
              <div className="mt-2 flex items-end gap-1">
                <span className="text-2xl font-black tracking-tight">{p.price}</span>
                <span className="pb-1 text-[11px] text-muted-foreground">{p.unit}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{p.blurb}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Billing is not processed in-app yet — pick a plan and our team invoices your organization directly.
        </p>
      </div>
    </div>

  );
}

function ProductsCard() {
  const { has, setProduct, loading } = useTenantProducts();
  const [busy, setBusy] = useState<ProductKey | null>(null);

  async function toggle(key: ProductKey, enabled: boolean) {
    setBusy(key);
    try {
      await setProduct(key, enabled);
      toast.success(enabled ? "Product activated." : "Product switched off.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="kpi-card p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Your products</h2>
      <p className="text-xs text-muted-foreground">
        Switch a product on to unlock its boards for everyone in your organization. Switching off hides it — your data stays.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCTS.map((p) => {
          const on = has(p.key);
          return (
            <div key={p.key} className={`rounded-md border p-4 ${on ? "border-primary/40 bg-primary/5" : "border-border bg-surface-2/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.tagline}</div>
                </div>
                {on && <span className="chip border border-success/30 bg-success/15 text-success text-[10px]"><Check className="h-3 w-3" /> Active</span>}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{p.price} {p.priceUnit}</div>
              <button
                onClick={() => void toggle(p.key, !on)}
                disabled={loading || busy === p.key}
                className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  on ? "border border-border bg-surface-2 hover:bg-surface-2/70" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}>
                {busy === p.key && <Loader2 className="h-3 w-3 animate-spin" />}
                {on ? "Turn off" : "Activate"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SyncQueueCard() {
  const { stats, problems } = useSheetSyncStatus();
  const drain = useDrainSheetOutbox();
  const pending = stats.data.pending;
  const failed = stats.data.failed;

  async function retryAll() {
    try {
      await requeueAllFailed();
      await drain.mutateAsync();
      toast.success("Retrying every stuck update");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function retryOne(id: string) {
    try {
      await requeueOutboxEntry(id);
      await drain.mutateAsync();
      toast.success("Retried");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function discard(id: string) {
    try {
      await discardOutboxEntry(id);
      void problems.refetch();
      void stats.refetch();
      toast.success("Removed from the queue");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="kpi-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Sheet Sync Queue</h2>
          <p className="text-xs text-muted-foreground">
            Every update to the sheet is queued first and retried automatically, so nothing is lost
            when the sheet is slow, busy or offline.
          </p>
        </div>
        <button onClick={() => drain.mutate()} disabled={drain.isPending}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 text-primary text-sm hover:bg-primary/10 disabled:opacity-50">
          {drain.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-surface-2/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Waiting</div>
          <div className="text-xl font-semibold tabular-nums">{pending}</div>
        </div>
        <div className={`rounded-md border p-3 ${failed > 0 ? "border-destructive/40 bg-destructive/10" : "border-border bg-surface-2/40"}`}>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Needs attention</div>
          <div className="text-xl font-semibold tabular-nums">{failed}</div>
        </div>
      </div>

      {failed > 0 && (
        <button onClick={retryAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <RefreshCw className="h-3.5 w-3.5" /> Retry all stuck updates
        </button>
      )}

      {problems.data.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border">
          {problems.data.map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{describeEntry(e)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {e.status === "failed" ? (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {e.last_error ?? "Could not be sent"}
                    </span>
                  ) : (
                    <>Waiting · attempt {e.attempts + 1}</>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => retryOne(e.id)} title="Retry"
                  className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => discard(e.id)} title="Remove"
                  className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

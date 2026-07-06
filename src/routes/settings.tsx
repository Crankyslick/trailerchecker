import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateWebhookCache } from "@/lib/webhook";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Trailer Checker" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [endpoint, setEndpoint] = useState("");
  const [webhook, setWebhook] = useState("");
  const [complianceHours, setComplianceHours] = useState(24);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sync_config").select("endpoint_url,webhook_url").eq("id", 1).maybeSingle();
      if (data) {
        setEndpoint(data.endpoint_url ?? "");
        setWebhook((data as { webhook_url: string | null }).webhook_url ?? "");
      }
    })();
  }, []);

  async function save() {
    const { error } = await supabase.from("sync_config").update({
      endpoint_url: endpoint || null, webhook_url: webhook || null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); invalidateWebhookCache(); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><SettingsIcon className="h-6 w-6 text-primary" /> Settings</h1>
        <p className="text-sm text-muted-foreground">Compliance thresholds and external sync endpoints.</p>
      </div>

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
        <h2 className="text-sm font-semibold">External Sync</h2>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Google Sheet Webhook URL</span>
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Read-back Endpoint (optional)</span>
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.sheety.co/..."
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        </label>
        <div className="flex justify-end">
          <button onClick={save} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Truck as TruckIcon, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sync, setSync] = useState<{ url: string | null; last: string | null }>({ url: null, last: null });
  const [, tick] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("sync_config").select("endpoint_url,last_synced_at").eq("id", 1).maybeSingle();
      if (data) setSync({ url: data.endpoint_url, last: data.last_synced_at });
    };
    load();
    const ch = supabase
      .channel("sync_config-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_config" }, load)
      .subscribe();
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const connected = Boolean(sync.url);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-border bg-surface/70 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <TruckIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold tracking-tight truncate">Vital Transportation · Dispatch Control</div>
            <div className="text-[11px] text-muted-foreground">Yard 589 · Chambersburg PA DC · Ahmed Beshir</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`chip border ${connected ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`} title={sync.url ?? "Not configured"}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            <span className="hidden sm:inline">{connected ? "Connected to Sheet API" : "Sheet API not configured"}</span>
            <span className="hidden md:inline opacity-70">· Last Auto-Fetch: {timeAgo(sync.last)}</span>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}

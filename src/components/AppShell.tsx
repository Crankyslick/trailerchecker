import { useEffect, useState } from "react";
import { Wifi, Settings as SettingsIcon, LogOut, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { DataHealthBanner } from "@/components/DataHealthBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { useDispatcherRealtime, useDriverRealtime } from "@/hooks/use-realtime";
import { useCurrentUser } from "@/hooks/use-auth";
import { useSheetOutboxWorker } from "@/hooks/use-sheet-sync";
import { useYardPolicy } from "@/hooks/use-company-settings";
import { readSyncConfig } from "@/lib/sync-config";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "DC Manager",
  dispatcher: "Dispatcher",
  guard: "Gate Guard",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sync, setSync] = useState<{ url: string | null; last: string | null }>({
    url: null,
    last: null,
  });
  const [, tick] = useState(0);
  const { profile, roles, org } = useCurrentUser();
  useSheetOutboxWorker();
  // Loads the company's yard rule once and publishes it to the shared
  // aging helpers, so every board colours trailers by the saved thresholds.
  useYardPolicy();
  const isDispatchStaff = roles.some((r) => r === "owner" || r === "admin" || r === "dispatcher");
  useDispatcherRealtime(isDispatchStaff);
  useDriverRealtime(roles.includes("driver"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      const cfg = await readSyncConfig();
      setSync({
        url: cfg?.spreadsheet_id ?? null,
        last: cfg?.last_synced_at ?? null,
      });
    };
    void load();
    let ch: ReturnType<typeof supabase.channel> | undefined;
    try {
      ch = supabase
        .channel(`trailer_sync_config-stream-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trailer_sync_config" },
          () => {
            void load();
          },
        )
        .subscribe();
    } catch {
      /* noop */
    }
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
      clearInterval(t);
    };
  }, []);

  const connected = Boolean(sync.url);
  const role = roles[0] ? (ROLE_LABEL[roles[0]] ?? roles[0]) : "No role";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 md:px-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface/70 backdrop-blur sticky top-0 z-20">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">
              {org?.name ?? "Trailer Compliance Control Tower"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Chambersburg PA DC · 24h Yard Turnaround Enforcement
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`chip border ${connected ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}
              title={sync.url ?? "Not configured"}
            >
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span className="hidden sm:inline">
                {connected ? "Connected to Sheet API" : "Sheet API not configured"}
              </span>
              <span className="hidden md:inline opacity-70">· Last: {timeAgo(sync.last)}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 chip border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheck className="h-3 w-3" />
              <span className="max-w-[140px] truncate">
                {profile?.full_name ?? profile?.email ?? "Signed in"} · {role}
              </span>
            </div>
            <NotificationBell />
            <button
              onClick={signOut}
              title="Sign out"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
            >
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <DataHealthBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

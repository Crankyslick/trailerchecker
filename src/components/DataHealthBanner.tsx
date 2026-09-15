import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDataHealth } from "@/lib/data-health";
import { useNowTick } from "@/hooks/use-loads";

const LABEL: Record<string, string> = {
  loads: "loads",
  yard: "yard check-ins",
  drivers: "drivers",
  products: "subscription",
  reports: "reporting data",
};

/** Age after which data is considered stale even if no error was reported. */
const STALE_MS = 5 * 60_000;

function ago(ms: number | null) {
  if (ms == null) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function DataHealthBanner() {
  useNowTick(15_000);
  const health = useDataHealth();
  const queryClient = useQueryClient();

  const stale = health.lastUpdatedAt != null && Date.now() - health.lastUpdatedAt > STALE_MS;
  if (health.ok && !health.realtimeDown && !stale) return null;

  const failing = health.failing.map((k) => LABEL[k] ?? k);
  const critical = failing.length > 0;

  return (
    <div
      role="alert"
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs ${
        critical
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      {critical ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      <div className="flex-1 min-w-[200px]">
        <span className="font-semibold">
          {critical
            ? `Can't load ${failing.join(", ")} right now.`
            : health.realtimeDown
              ? "Live updates are disconnected."
              : "This data may be out of date."}
        </span>{" "}
        <span className="opacity-80">
          What you see may be out of date — last refreshed {ago(health.lastUpdatedAt)}. Changes are
          blocked until it reconnects.
        </span>
      </div>
      <button
        onClick={() => void queryClient.refetchQueries()}
        className="inline-flex items-center gap-1.5 rounded border border-current/40 px-2.5 py-1 font-medium hover:bg-current/10"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry now
      </button>
    </div>
  );
}

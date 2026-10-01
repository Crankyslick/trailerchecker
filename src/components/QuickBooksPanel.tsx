import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Link2, Unlink, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVENUE_ITEMS } from "@/lib/qbo/revenue-items";
import {
  getQboStatus,
  startQboConnect,
  disconnectQbo,
  refreshQboPayments,
} from "@/lib/qbo.functions";

const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
  from: (table: string) => any;
};

export function useQboStatus(enabled: boolean) {
  const fn = useServerFn(getQboStatus);
  return useQuery({
    queryKey: ["qbo-status"],
    enabled,
    queryFn: () => fn({ data: undefined }),
    staleTime: 30_000,
    retry: false,
  });
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-muted-foreground/60"}`}
      aria-hidden
    />
  );
}

export function QuickBooksPanel({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const { data: status, isLoading, error } = useQboStatus(true);
  const connectFn = useServerFn(startQboConnect);
  const disconnectFn = useServerFn(disconnectQbo);
  const refreshFn = useServerFn(refreshQboPayments);
  const [mapOpen, setMapOpen] = useState(false);

  // Surface the result of the QuickBooks round-trip once we land back here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get("qbo");
    if (!r) return;
    if (r === "connected") toast.success("QuickBooks connected");
    else if (r === "denied") toast.error("QuickBooks connection was cancelled");
    else if (r === "expired") toast.error("That connection link expired — try again");
    else toast.error("Could not connect to QuickBooks");
    params.delete("qbo");
    const q = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    void qc.invalidateQueries({ queryKey: ["qbo-status"] });
  }, [qc]);

  const connect = useMutation({
    mutationFn: async () => connectFn({ data: undefined }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async () => disconnectFn({ data: undefined }),
    onSuccess: () => {
      toast.success("QuickBooks disconnected");
      void qc.invalidateQueries({ queryKey: ["qbo-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: async () => refreshFn({ data: undefined }),
    onSuccess: (r) => {
      toast.success(`Checked ${r.checked} invoice(s); ${r.paid} marked paid`);
      void qc.invalidateQueries({ queryKey: ["customer_invoices"] });
      void qc.invalidateQueries({ queryKey: ["qbo-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Checking QuickBooks…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        QuickBooks is only available to billing and admin users.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Dot ok={Boolean(status?.connected)} />
          <span className="font-semibold">QuickBooks</span>
          {status?.connected ? (
            <span className="text-muted-foreground">
              {status.companyName ?? `Company ${status.realmId}`}
              {status.environment === "sandbox" ? " (test company)" : ""}
              {status.lastSyncedAt
                ? ` · last sync ${new Date(status.lastSyncedAt).toLocaleString()}`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {status?.configured ? "Not connected" : "Not set up yet"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status?.connected && (
            <>
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {refresh.isPending ? "Checking…" : "Check payments"}
              </button>
              <button
                onClick={() => setMapOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
              >
                <Settings2 className="h-3.5 w-3.5" /> Charge mapping
              </button>
            </>
          )}
          {canWrite &&
            (status?.connected ? (
              <button
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" /> Disconnect
              </button>
            ) : (
              <button
                onClick={() => connect.mutate()}
                disabled={!status?.configured || connect.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {connect.isPending ? "Opening…" : "Connect to QuickBooks"}
              </button>
            ))}
        </div>
      </div>

      {!status?.configured && (
        <p className="text-xs text-muted-foreground">
          QuickBooks needs your Intuit app credentials before it can be connected. Add them in
          settings and this card will switch on.
        </p>
      )}

      {mapOpen && status?.connected && <ChargeMapping />}
    </div>
  );
}

type MappingRow = {
  revenue_code: string;
  qbo_item_name: string | null;
  qbo_income_account: string | null;
};

function ChargeMapping() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["qbo_account_mappings"],
    queryFn: async (): Promise<MappingRow[]> => {
      const { data, error } = await sb
        .from("qbo_account_mappings")
        .select("revenue_code, qbo_item_name, qbo_income_account");
      if (error) throw new Error(error.message);
      return (data ?? []) as MappingRow[];
    },
  });

  const byCode = new Map((data ?? []).map((m) => [m.revenue_code, m]));

  async function save(code: string, itemName: string, account: string) {
    const { error } = await sb.from("qbo_account_mappings").upsert(
      {
        revenue_code: code,
        qbo_item_name: itemName || null,
        qbo_income_account: account || null,
      },
      { onConflict: "company_id,revenue_code" },
    );
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["qbo_account_mappings"] });
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">Charge</th>
            <th className="text-left px-3 py-2">QuickBooks item</th>
            <th className="text-left px-3 py-2">Income account id</th>
          </tr>
        </thead>
        <tbody>
          {REVENUE_ITEMS.map((r) => {
            const m = byCode.get(r.code);
            return (
              <tr key={r.code} className="border-t border-border">
                <td className="px-3 py-1.5 text-xs">{r.label}</td>
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={m?.qbo_item_name ?? ""}
                    placeholder={r.defaultItem}
                    className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
                    onBlur={(e) =>
                      void save(r.code, e.target.value.trim(), m?.qbo_income_account ?? "")
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={m?.qbo_income_account ?? ""}
                    placeholder="auto"
                    className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
                    onBlur={(e) => void save(r.code, m?.qbo_item_name ?? "", e.target.value.trim())}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Leave blank to let QuickBooks create a matching service item automatically.
      </p>
    </div>
  );
}

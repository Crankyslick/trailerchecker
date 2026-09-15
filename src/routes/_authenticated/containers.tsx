import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Container as ContainerIcon, Plus, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantProducts } from "@/hooks/use-products";
import type { Database } from "@/integrations/supabase/types";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/containers")({
  beforeLoad: guard({ product: "drayage" }),
  head: () => ({
    meta: [
      { title: "Container Board — Me Do Logistics" },
      { name: "description", content: "Live drayage container board: port moves, chassis, last free day countdowns and driver assignment." },
      { property: "og:title", content: "Container Board — Me Do Logistics" },
      { property: "og:description", content: "Run port and rail container moves with live last free day countdowns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContainersPage,
});

type ContainerRow = Database["public"]["Tables"]["containers"]["Row"];
type ContainerStatus = Database["public"]["Enums"]["container_status"];

const STATUSES: ContainerStatus[] = [
  "Available", "Dispatched", "At Port", "Loaded", "In Transit",
  "Delivered", "Empty Ready", "Returned", "Completed", "Delayed", "Exception",
];

function statusClass(s: ContainerStatus): string {
  switch (s) {
    case "Completed":
    case "Returned":
      return "bg-success/15 text-success border-success/30";
    case "Delayed":
    case "Exception":
      return "bg-danger/15 text-danger border-danger/30";
    case "In Transit":
    case "Dispatched":
      return "bg-info/15 text-info border-info/30";
    case "Delivered":
    case "Empty Ready":
      return "bg-primary/15 text-primary border-primary/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function daysLeft(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function ContainersPage() {
  const { has, loading: productsLoading } = useTenantProducts();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    container_number: "", size: "40HC", steamship_line: "", bill_of_lading: "",
    port_terminal: "", delivery_location: "", last_free_day: "", rate: "",
  });

  const containers = useQuery({
    queryKey: ["containers"],
    queryFn: async (): Promise<ContainerRow[]> => {
      const { data, error } = await supabase
        .from("containers")
        .select("*")
        .order("last_free_day", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) { console.error("[containers]", error.message); return []; }
      return (data ?? []) as ContainerRow[];
    },
    initialData: [] as ContainerRow[],
  });

  const drivers = useQuery({
    queryKey: ["drivers-for-containers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id, name").eq("active", true).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    initialData: [] as { id: string; name: string }[],
  });

  const rows = containers.data ?? [];
  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== "Completed" && r.status !== "Returned");
    const atRisk = open.filter((r) => { const d = daysLeft(r.last_free_day); return d != null && d <= 1; });
    const unassigned = open.filter((r) => !r.driver_id);
    return { total: rows.length, open: open.length, atRisk: atRisk.length, unassigned: unassigned.length };
  }, [rows]);

  async function patch(id: string, values: Partial<ContainerRow>) {
    const { error } = await supabase.from("containers").update(values).eq("id", id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["containers"] });
  }

  async function create() {
    if (!form.container_number.trim()) { toast.error("Container number is required."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("containers").insert({
        container_number: form.container_number.trim().toUpperCase(),
        size: form.size || null,
        steamship_line: form.steamship_line.trim() || null,
        bill_of_lading: form.bill_of_lading.trim() || null,
        port_terminal: form.port_terminal.trim() || null,
        delivery_location: form.delivery_location.trim() || null,
        last_free_day: form.last_free_day || null,
        rate: form.rate ? Number(form.rate) : null,
      });
      if (error) throw new Error(error.message);
      toast.success("Container added.");
      setForm({ container_number: "", size: "40HC", steamship_line: "", bill_of_lading: "", port_terminal: "", delivery_location: "", last_free_day: "", rate: "" });
      setAdding(false);
      await qc.invalidateQueries({ queryKey: ["containers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (productsLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!has("drayage")) {
    return (
      <div className="mx-auto max-w-lg kpi-card p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Drayage isn't active on this account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The container board is part of the Drayage product. An owner or admin can switch it on from Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ContainerIcon className="h-6 w-6 text-primary" /> Container Board
          </h1>
          <p className="text-sm text-muted-foreground">Port and rail moves, chassis, and last free day exposure.</p>
        </div>
        <button onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> New container
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Containers" value={stats.total} />
        <Kpi label="Open moves" value={stats.open} />
        <Kpi label="LFD within 24h" value={stats.atRisk} tone="danger" />
        <Kpi label="No driver" value={stats.unassigned} tone="warning" />
      </div>

      {adding && (
        <div className="kpi-card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Container #" value={form.container_number} onChange={(v) => setForm({ ...form, container_number: v })} />
          <Input label="Size" value={form.size} onChange={(v) => setForm({ ...form, size: v })} />
          <Input label="Steamship line" value={form.steamship_line} onChange={(v) => setForm({ ...form, steamship_line: v })} />
          <Input label="Bill of lading" value={form.bill_of_lading} onChange={(v) => setForm({ ...form, bill_of_lading: v })} />
          <Input label="Port / terminal" value={form.port_terminal} onChange={(v) => setForm({ ...form, port_terminal: v })} />
          <Input label="Delivery location" value={form.delivery_location} onChange={(v) => setForm({ ...form, delivery_location: v })} />
          <Input label="Last free day" type="date" value={form.last_free_day} onChange={(v) => setForm({ ...form, last_free_day: v })} />
          <Input label="Rate" type="number" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} />
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button onClick={create} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save container
            </button>
          </div>
        </div>
      )}

      <div className="kpi-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th>Container</Th><Th>Size</Th><Th>Line</Th><Th>Terminal</Th>
              <Th>Delivery</Th><Th>LFD</Th><Th>Chassis</Th><Th>Driver</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                No containers yet. Add your first move to start the board.
              </td></tr>
            )}
            {rows.map((c) => {
              const d = daysLeft(c.last_free_day);
              const lfdTone = d == null ? "text-muted-foreground" : d < 0 ? "text-danger" : d <= 1 ? "text-warning" : "text-foreground";
              return (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                  <Td className="font-mono font-semibold">{c.container_number}</Td>
                  <Td>{c.size ?? "—"}</Td>
                  <Td>{c.steamship_line ?? "—"}</Td>
                  <Td>{c.port_terminal ?? "—"}</Td>
                  <Td>{c.delivery_location ?? "—"}</Td>
                  <Td>
                    <span className={lfdTone}>
                      {c.last_free_day ?? "—"}{d != null && ` · ${d}d`}
                    </span>
                  </Td>
                  <Td>
                    <input defaultValue={c.chassis_number ?? ""} placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.chassis_number ?? "")) void patch(c.id, { chassis_number: v || null }); }}
                      className="w-28 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs outline-none hover:border-border focus:border-primary/60" />
                  </Td>
                  <Td>
                    <select value={c.driver_id ?? ""} onChange={(e) => void patch(c.id, { driver_id: e.target.value || null })}
                      className="rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary/60">
                      <option value="">Unassigned</option>
                      {drivers.data.map((dr) => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                    </select>
                  </Td>
                  <Td>
                    <select value={c.status} onChange={(e) => void patch(c.id, { status: e.target.value as ContainerStatus })}
                      className={`chip border ${statusClass(c.status)} bg-transparent px-2 py-1 text-xs outline-none`}>
                      {STATUSES.map((s) => <option key={s} value={s} className="bg-surface text-foreground">{s}</option>)}
                    </select>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="kpi-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-black tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/60" />
    </label>
  );
}

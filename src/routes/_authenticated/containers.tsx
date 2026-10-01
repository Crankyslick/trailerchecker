import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Container as ContainerIcon, Plus, Loader2, Lock, Anchor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import type { Database } from "@/integrations/supabase/types";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/containers")({
  beforeLoad: guard({ product: "drayage" }),
  head: () => ({
    meta: [
      { title: "Container Board — Me Do Logistics" },
      {
        name: "description",
        content:
          "Live drayage container board: port moves, chassis, last free day countdowns and driver assignment.",
      },
      { property: "og:title", content: "Container Board — Me Do Logistics" },
      {
        property: "og:description",
        content: "Run port and rail container moves with live last free day countdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContainersPage,
});

type ContainerRow = Database["public"]["Tables"]["containers"]["Row"];
type ContainerStatus = Database["public"]["Enums"]["container_status"];
type ChassisRow = Database["public"]["Tables"]["chassis"]["Row"];

const STATUSES: ContainerStatus[] = [
  "Available",
  "Dispatched",
  "At Port",
  "Loaded",
  "In Transit",
  "Delivered",
  "Empty Ready",
  "Returned",
  "Completed",
  "Delayed",
  "Exception",
];

const CHASSIS_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE"] as const;

type Milestone = "DISCHARGED" | "PICKED_UP" | "DELIVERED" | "RETURNED";

const MILESTONES: { key: Milestone; label: string; field: keyof ContainerRow }[] = [
  { key: "DISCHARGED", label: "Discharged", field: "discharged_at" },
  { key: "PICKED_UP", label: "Picked up", field: "picked_up_at" },
  { key: "DELIVERED", label: "Delivered", field: "delivered_at" },
  { key: "RETURNED", label: "Returned", field: "returned_at" },
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

/** Days left on the consignee's free time before detention charges start. */
function detentionDaysLeft(c: ContainerRow): number | null {
  if (!c.delivered_at || c.returned_at) return null;
  const start = new Date(c.delivered_at).getTime();
  const deadline = start + (c.detention_free_days ?? 0) * 86_400_000;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function ContainersPage() {
  const { has, loading: productsLoading } = useTenantProducts();
  const qc = useQueryClient();
  const customers = useCustomers();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [milestoneBusy, setMilestoneBusy] = useState<string | null>(null);
  const [showChassis, setShowChassis] = useState(false);
  const [chassisForm, setChassisForm] = useState({ chassis_number: "", pool_provider: "" });
  const [chassisBusy, setChassisBusy] = useState(false);
  const [form, setForm] = useState({
    container_number: "",
    size: "40HC",
    steamship_line: "",
    bill_of_lading: "",
    port_terminal: "",
    delivery_location: "",
    last_free_day: "",
    detention_free_days: "2",
    customer_id: "",
    rate: "",
  });

  const containers = useQuery({
    queryKey: ["containers"],
    queryFn: async (): Promise<ContainerRow[]> => {
      const { data, error } = await supabase
        .from("containers")
        .select("*")
        .order("last_free_day", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[containers]", error.message);
        return [];
      }
      return (data ?? []) as ContainerRow[];
    },
    initialData: [] as ContainerRow[],
  });

  const chassis = useQuery({
    queryKey: ["chassis"],
    queryFn: async (): Promise<ChassisRow[]> => {
      const { data, error } = await supabase.from("chassis").select("*").order("chassis_number");
      if (error) {
        console.error("[chassis]", error.message);
        return [];
      }
      return (data ?? []) as ChassisRow[];
    },
    initialData: [] as ChassisRow[],
  });

  const drivers = useQuery({
    queryKey: ["drivers-for-containers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("drivers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    initialData: [] as { id: string; name: string }[],
  });

  const rows = containers.data ?? [];
  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== "Completed" && r.status !== "Returned");
    const atRisk = open.filter((r) => {
      const d = daysLeft(r.last_free_day);
      return d != null && d <= 1;
    });
    const unassigned = open.filter((r) => !r.driver_id);
    const detention = open.filter((r) => {
      const d = detentionDaysLeft(r);
      return d != null && d <= 0;
    });
    return {
      total: rows.length,
      open: open.length,
      atRisk: atRisk.length,
      unassigned: unassigned.length,
      detention: detention.length,
    };
  }, [rows]);

  const customerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers.data ?? []) map.set(c.id, c.name);
    return map;
  }, [customers.data]);

  async function patch(id: string, values: Partial<ContainerRow>) {
    const { error } = await supabase.from("containers").update(values).eq("id", id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["containers"] });
  }

  async function logMilestone(id: string, milestone: Milestone) {
    setMilestoneBusy(`${id}:${milestone}`);
    try {
      const { error } = await supabase.rpc("log_container_milestone", {
        p_container_id: id,
        p_milestone: milestone,
      });
      if (error) throw new Error(error.message);
      toast.success(`Logged ${milestone.toLowerCase().replace("_", " ")}.`);
      await qc.invalidateQueries({ queryKey: ["containers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMilestoneBusy(null);
    }
  }

  async function createChassis() {
    const num = chassisForm.chassis_number.trim().toUpperCase();
    if (!num) {
      toast.error("Chassis number is required.");
      return;
    }
    setChassisBusy(true);
    try {
      const { error } = await supabase.from("chassis").insert({
        chassis_number: num,
        pool_provider: chassisForm.pool_provider.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Chassis added to the pool.");
      setChassisForm({ chassis_number: "", pool_provider: "" });
      await qc.invalidateQueries({ queryKey: ["chassis"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChassisBusy(false);
    }
  }

  async function setChassisStatus(id: string, status: string) {
    const { error } = await supabase
      .from("chassis")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["chassis"] });
  }

  async function create() {
    if (!form.container_number.trim()) {
      toast.error("Container number is required.");
      return;
    }
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
        detention_free_days: form.detention_free_days ? Number(form.detention_free_days) : 2,
        customer_id: form.customer_id || null,
        rate: form.rate ? Number(form.rate) : null,
      });
      if (error) throw new Error(error.message);
      toast.success("Container added.");
      setForm({
        container_number: "",
        size: "40HC",
        steamship_line: "",
        bill_of_lading: "",
        port_terminal: "",
        delivery_location: "",
        last_free_day: "",
        detention_free_days: "2",
        customer_id: "",
        rate: "",
      });
      setAdding(false);
      await qc.invalidateQueries({ queryKey: ["containers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (productsLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!has("drayage")) {
    return (
      <div className="mx-auto max-w-lg kpi-card p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Drayage isn't active on this account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The container board is part of the Drayage product. An owner or admin can switch it on
          from Settings.
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
          <p className="text-sm text-muted-foreground">
            Port and rail moves, chassis, and last free day exposure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowChassis((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-semibold hover:border-primary/60"
          >
            <Anchor className="h-4 w-4" /> Chassis pool
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New container
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Containers" value={stats.total} />
        <Kpi label="Open moves" value={stats.open} />
        <Kpi label="LFD within 24h" value={stats.atRisk} tone="danger" />
        <Kpi label="In detention" value={stats.detention} tone="danger" />
        <Kpi label="No driver" value={stats.unassigned} tone="warning" />
      </div>

      {showChassis && (
        <div className="kpi-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Chassis pool
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Input
              label="Chassis #"
              value={chassisForm.chassis_number}
              onChange={(v) => setChassisForm({ ...chassisForm, chassis_number: v })}
            />
            <Input
              label="Pool provider"
              value={chassisForm.pool_provider}
              onChange={(v) => setChassisForm({ ...chassisForm, pool_provider: v })}
            />
            <div className="flex items-end">
              <button
                onClick={createChassis}
                disabled={chassisBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {chassisBusy && <Loader2 className="h-4 w-4 animate-spin" />} Add chassis
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Th>Chassis</Th>
                  <Th>Provider</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {chassis.data.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">
                      No chassis yet. Add the units you own or pull from a pool.
                    </td>
                  </tr>
                )}
                {chassis.data.map((ch) => (
                  <tr key={ch.id} className="border-b border-border/60 last:border-0">
                    <Td className="font-mono font-semibold">{ch.chassis_number}</Td>
                    <Td>{ch.pool_provider ?? "—"}</Td>
                    <Td>
                      <select
                        value={ch.status}
                        onChange={(e) => void setChassisStatus(ch.id, e.target.value)}
                        className="rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary/60"
                      >
                        {CHASSIS_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && (
        <div className="kpi-card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Container #"
            value={form.container_number}
            onChange={(v) => setForm({ ...form, container_number: v })}
          />
          <Input label="Size" value={form.size} onChange={(v) => setForm({ ...form, size: v })} />
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Customer
            </span>
            <select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/60"
            >
              <option value="">— none —</option>
              {(customers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Steamship line"
            value={form.steamship_line}
            onChange={(v) => setForm({ ...form, steamship_line: v })}
          />
          <Input
            label="Bill of lading"
            value={form.bill_of_lading}
            onChange={(v) => setForm({ ...form, bill_of_lading: v })}
          />
          <Input
            label="Port / terminal"
            value={form.port_terminal}
            onChange={(v) => setForm({ ...form, port_terminal: v })}
          />
          <Input
            label="Delivery location"
            value={form.delivery_location}
            onChange={(v) => setForm({ ...form, delivery_location: v })}
          />
          <Input
            label="Last free day"
            type="date"
            value={form.last_free_day}
            onChange={(v) => setForm({ ...form, last_free_day: v })}
          />
          <Input
            label="Detention free days"
            type="number"
            value={form.detention_free_days}
            onChange={(v) => setForm({ ...form, detention_free_days: v })}
          />
          <Input
            label="Rate"
            type="number"
            value={form.rate}
            onChange={(v) => setForm({ ...form, rate: v })}
          />
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              onClick={create}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save container
            </button>
          </div>
        </div>
      )}

      <div className="kpi-card overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th>Container</Th>
              <Th>Customer</Th>
              <Th>Terminal</Th>
              <Th>Delivery</Th>
              <Th>LFD</Th>
              <Th>Detention</Th>
              <Th>Chassis</Th>
              <Th>Driver</Th>
              <Th>Status</Th>
              <Th>Milestones</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                  No containers yet. Add your first move to start the board.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const d = daysLeft(c.last_free_day);
              const lfdTone =
                d == null
                  ? "text-muted-foreground"
                  : d < 0
                    ? "text-danger"
                    : d <= 1
                      ? "text-warning"
                      : "text-foreground";
              const det = detentionDaysLeft(c);
              const detTone =
                det == null
                  ? "text-muted-foreground"
                  : det < 0
                    ? "text-danger"
                    : det <= 1
                      ? "text-warning"
                      : "text-foreground";
              return (
                <tr
                  key={c.id}
                  className="border-b border-border/60 last:border-0 hover:bg-surface-2/40"
                >
                  <Td className="font-mono font-semibold">
                    {c.container_number}
                    <div className="font-sans text-[11px] font-normal text-muted-foreground">
                      {c.size ?? "—"}
                      {c.steamship_line ? ` · ${c.steamship_line}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <select
                      value={c.customer_id ?? ""}
                      onChange={(e) => void patch(c.id, { customer_id: e.target.value || null })}
                      className="max-w-[160px] rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary/60"
                    >
                      <option value="">
                        {c.customer_id ? (customerName.get(c.customer_id) ?? "—") : "Unassigned"}
                      </option>
                      {(customers.data ?? []).map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          {cust.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>{c.port_terminal ?? "—"}</Td>
                  <Td>{c.delivery_location ?? "—"}</Td>
                  <Td>
                    <span className={lfdTone}>
                      {c.last_free_day ?? "—"}
                      {d != null && ` · ${d}d`}
                    </span>
                  </Td>
                  <Td>
                    <span className={detTone}>
                      {det == null ? "—" : det < 0 ? `${Math.abs(det)}d over` : `${det}d left`}
                    </span>
                  </Td>
                  <Td>
                    <select
                      value={c.chassis_id ?? ""}
                      onChange={(e) => void patch(c.id, { chassis_id: e.target.value || null })}
                      className="w-32 rounded border border-border bg-surface-2 px-2 py-1 font-mono text-xs outline-none focus:border-primary/60"
                    >
                      <option value="">{c.chassis_number ?? "—"}</option>
                      {chassis.data.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.chassis_number}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <select
                      value={c.driver_id ?? ""}
                      onChange={(e) => void patch(c.id, { driver_id: e.target.value || null })}
                      className="rounded border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary/60"
                    >
                      <option value="">Unassigned</option>
                      {drivers.data.map((dr) => (
                        <option key={dr.id} value={dr.id}>
                          {dr.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <select
                      value={c.status}
                      onChange={(e) =>
                        void patch(c.id, { status: e.target.value as ContainerStatus })
                      }
                      className={`chip border ${statusClass(c.status)} bg-transparent px-2 py-1 text-xs outline-none`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-surface text-foreground">
                          {s}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {MILESTONES.map((m) => {
                        const done = Boolean(c[m.field]);
                        const key = `${c.id}:${m.key}`;
                        return (
                          <button
                            key={m.key}
                            disabled={done || milestoneBusy === key}
                            onClick={() => void logMilestone(c.id, m.key)}
                            title={
                              done
                                ? `${m.label} at ${new Date(String(c[m.field])).toLocaleString()}`
                                : `Log ${m.label.toLowerCase()}`
                            }
                            className={`rounded border px-2 py-1 text-[11px] font-medium ${
                              done
                                ? "border-success/30 bg-success/15 text-success"
                                : "border-border bg-surface-2 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                            } disabled:cursor-default`}
                          >
                            {milestoneBusy === key ? "…" : m.label}
                          </button>
                        );
                      })}
                    </div>
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

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  const color =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";
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
function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

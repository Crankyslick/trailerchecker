import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoads, useNowTick } from "@/hooks/use-loads";
import {
  LOAD_STATUSES,
  TRAILER_LOCATIONS,
  yardHours,
  type LoadRow,
  type LoadStatus,
  type TrailerLocation,
} from "@/lib/loads";
import { StatusChip, LocationChip, YardChip } from "@/components/Chips";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Filter } from "lucide-react";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/loads")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Live Load Board — VTCD Dispatch" }] }),
  component: LoadBoard,
});

async function updateLoad(id: string, patch: Partial<LoadRow>) {
  const { error } = await supabase.from("trailer_loads").update(patch).eq("id", id);
  if (error) toast.error(error.message);
  else toast.success("Saved");
}

function EditableText({
  value,
  onSave,
  placeholder,
  mono,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-left w-full hover:bg-surface-2 rounded px-1.5 py-1 ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value ?? <span className="text-muted-foreground/60">{placeholder ?? "—"}</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if ((v || null) !== value) onSave(v || null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value ?? "");
          setEditing(false);
        }
      }}
      className={`w-full bg-surface-2 border border-primary/40 rounded px-1.5 py-1 outline-none ${mono ? "font-mono text-xs" : "text-sm"}`}
    />
  );
}

function LoadBoard() {
  useNowTick(30_000);
  const { data: loads = [] } = useLoads();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const stores = useMemo(
    () => Array.from(new Set(loads.map((l) => l.str_number).filter(Boolean))) as string[],
    [loads],
  );

  const filtered = useMemo(() => {
    return loads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (locFilter !== "all" && l.return_trailer_location !== locFilter) return false;
      if (storeFilter !== "all" && l.str_number !== storeFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        return [
          l.schedule_id,
          l.driver,
          l.outbound_trailer,
          l.return_trailer,
          l.str_name,
          l.str_number,
        ]
          .filter(Boolean)
          .some((v) => v!.toString().toLowerCase().includes(s));
      }
      return true;
    });
  }, [loads, q, statusFilter, locFilter, storeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Load Board</h1>
          <p className="text-sm text-muted-foreground">
            Inline edit driver, return trailer, location and comments.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} of {loads.length}
        </div>
      </div>

      <div className="kpi-card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search schedule, driver, trailer, store…"
            className="w-full pl-8 pr-3 py-2 bg-surface-2 border border-border rounded text-sm outline-none focus:border-primary/50"
          />
        </div>
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {LOAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-2 text-sm"
        >
          <option value="all">All locations</option>
          {TRAILER_LOCATIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-2 text-sm"
        >
          <option value="all">All stores</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              Store {s}
            </option>
          ))}
        </select>
      </div>

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-3">Sch ID</th>
                <th className="text-left font-medium py-3 px-3">Store</th>
                <th className="text-left font-medium py-3 px-3">Driver</th>
                <th className="text-left font-medium py-3 px-3">Outbound</th>
                <th className="text-left font-medium py-3 px-3">Return</th>
                <th className="text-left font-medium py-3 px-3">Location</th>
                <th className="text-left font-medium py-3 px-3">Yard Time</th>
                <th className="text-center font-medium py-3 px-3">Sweep</th>
                <th className="text-center font-medium py-3 px-3">Seq</th>
                <th className="text-left font-medium py-3 px-3">Status</th>
                <th className="text-left font-medium py-3 px-3 min-w-[180px]">Comments</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-border/40 last:border-0 hover:bg-surface-2/30"
                >
                  <td className="py-2 px-3 font-mono text-xs">{l.schedule_id}</td>
                  <td className="py-2 px-3">
                    <div className="font-medium">{l.str_number}</div>
                    <div className="text-[11px] text-muted-foreground">{l.str_name}</div>
                  </td>
                  <td className="py-2 px-3">
                    <EditableText
                      value={l.driver}
                      onSave={(v) => updateLoad(l.id, { driver: v })}
                      placeholder="Unassigned"
                    />
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{l.outbound_trailer}</td>
                  <td className="py-2 px-3">
                    <EditableText
                      mono
                      value={l.return_trailer}
                      onSave={(v) => updateLoad(l.id, { return_trailer: v })}
                      placeholder="Add #"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={l.return_trailer_location ?? "DC"}
                      onChange={(e) =>
                        updateLoad(l.id, {
                          return_trailer_location: e.target.value as TrailerLocation,
                        })
                      }
                      className="bg-transparent border border-transparent hover:border-border rounded px-1.5 py-1 text-xs"
                    >
                      {TRAILER_LOCATIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <YardChip hours={yardHours(l.yard_arrival_at)} />
                  </td>
                  <td className="py-2 px-3 text-center">
                    {l.has_sweep ? (
                      <span className="chip border bg-info/15 text-info border-info/30">Yes</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums text-muted-foreground">
                    {l.delivery_sequence ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={l.status ?? "Assigned"}
                      onChange={(e) => updateLoad(l.id, { status: e.target.value as LoadStatus })}
                      className="bg-transparent border border-transparent hover:border-border rounded px-1.5 py-1 text-xs"
                    >
                      {LOAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <EditableText
                      value={l.comments}
                      onSave={(v) => updateLoad(l.id, { comments: v })}
                      placeholder="Add note…"
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    No loads match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHistoryLoads, HISTORY_PAGE_SIZE } from "@/hooks/use-loads";
import { History, Search, X } from "lucide-react";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/history/")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({
    meta: [
      { title: "Load History Archive — VTCD Dispatch" },
      {
        name: "description",
        content: "Archived past loads with date range, schedule ID and trailer number filters.",
      },
      { property: "og:title", content: "Load History Archive — VTCD Dispatch" },
      {
        property: "og:description",
        content:
          "Search archived Vital Transportation loads by date, schedule ID or trailer number.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryIndex,
});

function fmtDate(date: string | null) {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HistoryIndex() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [schedule, setSchedule] = useState("");
  const [trailer, setTrailer] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [from, to, schedule, trailer]);

  const query = useHistoryLoads({ from, to, schedule, trailer, page });
  const filtered = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const hasFilters = !!(from || to || schedule || trailer);
  const clear = () => {
    setFrom("");
    setTo("");
    setSchedule("");
    setTrailer("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Load History Archive</h1>
          <p className="text-sm text-muted-foreground">
            Every load scheduled before today. Filter by date range, schedule ID or trailer number.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {query.isFetching ? "Loading…" : `${total} archived load${total === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="kpi-card p-3 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-surface-2 border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary/50"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="bg-surface-2 border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary/50"
          />
        </Field>
        <Field label="Schedule ID">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g. 4412"
              className="w-40 pl-7 pr-2 py-1.5 bg-surface-2 border border-border rounded text-sm outline-none focus:border-primary/50"
            />
          </div>
        </Field>
        <Field label="Trailer #">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={trailer}
              onChange={(e) => setTrailer(e.target.value)}
              placeholder="outbound or return"
              className="w-44 pl-7 pr-2 py-1.5 bg-surface-2 border border-border rounded text-sm outline-none focus:border-primary/50"
            />
          </div>
        </Field>
        {hasFilters && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground border border-border"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="kpi-card divide-y divide-border">
        {filtered.map((l) => (
          <Link
            key={l.id}
            to="/history/$loadId"
            params={{ loadId: l.id }}
            className="flex items-center gap-4 p-3 hover:bg-surface-2/40 transition-colors"
          >
            <div className="h-9 w-9 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
              <History className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <div className="text-xs text-muted-foreground truncate">
                {fmtDate(l.schedule_date ?? l.cutoff_date)}
              </div>
              <div className="font-mono text-xs truncate">{l.schedule_id}</div>
              <div className="truncate">{l.driver ?? "—"}</div>
              <div className="truncate">
                {l.str_number} · {l.str_name}
              </div>
              <div className="font-mono text-xs truncate">OB {l.outbound_trailer ?? "—"}</div>
              <div className="font-mono text-xs truncate">RT {l.return_trailer ?? "—"}</div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && !query.isFetching && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {hasFilters ? "No archived loads match these filters." : "No archived loads yet."}
          </div>
        )}
        {query.error && (
          <div role="alert" className="py-6 text-center text-sm text-danger">
            Couldn&apos;t load the archive: {(query.error as Error).message}
          </div>
        )}
      </div>

      {total > HISTORY_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {page * HISTORY_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * HISTORY_PAGE_SIZE)} of{" "}
            {total}
          </span>
          <div className="space-x-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-border px-2.5 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * HISTORY_PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-border px-2.5 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

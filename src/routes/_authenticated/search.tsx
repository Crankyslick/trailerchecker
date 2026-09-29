import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusChip, LocationChip, YardChip } from "@/components/Chips";
import { yardHours, LOAD_STATUSES, type LoadRow, type LoadStatus } from "@/lib/loads";
import { Search as SearchIcon } from "lucide-react";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/search")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Trailer Search — Me Do Logistics" }] }),
  component: SearchPage,
});

const PAGE_SIZE = 50;

type EventHit = {
  id: string;
  load_id: string | null;
  trailer_number: string | null;
  trailer_role: string | null;
  event_type: string;
  note: string | null;
  created_at: string;
};

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Server-side search across loads (indexed columns) and the audit timeline. */
function useLoadSearch(term: string, page: number) {
  return useQuery({
    queryKey: ["search", "loads", term, page],
    enabled: term.trim().length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: LoadRow[]; total: number }> => {
      const t = term.trim().replace(/[%,()]/g, "");
      const statusMatch = LOAD_STATUSES.find((s) => s.toLowerCase() === t.toLowerCase());
      const filters = [
        `schedule_id.ilike.%${t}%`,
        `driver.ilike.%${t}%`,
        `outbound_trailer.ilike.%${t}%`,
        `return_trailer.ilike.%${t}%`,
        `str_number.ilike.%${t}%`,
        `str_name.ilike.%${t}%`,
        `comments.ilike.%${t}%`,
        `trip_id.ilike.%${t}%`,
        `pro_number.ilike.%${t}%`,
        `target_load_id.ilike.%${t}%`,
      ];
      if (statusMatch) filters.push(`status.eq.${statusMatch}`);

      const from = page * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("trailer_loads")
        .select("*", { count: "exact" })
        .or(filters.join(","))
        .order("schedule_date", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as LoadRow[], total: count ?? 0 };
    },
  });
}

function useEventSearch(term: string) {
  return useQuery({
    queryKey: ["search", "events", term],
    enabled: term.trim().length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EventHit[]> => {
      const t = term.trim().replace(/[%,()]/g, "");
      const { data, error } = await supabase
        .from("trailer_events")
        .select("id, load_id, trailer_number, trailer_role, event_type, note, created_at")
        .or(`trailer_number.ilike.%${t}%,note.ilike.%${t}%,event_type.ilike.%${t}%`)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw new Error(error.message);
      return (data ?? []) as EventHit[];
    },
  });
}

function SearchPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const term = useDebounced(q);

  useEffect(() => setPage(0), [term]);

  const loadsQuery = useLoadSearch(term, page);
  const eventsQuery = useEventSearch(term);

  const results = loadsQuery.data?.rows ?? [];
  const total = loadsQuery.data?.total ?? 0;
  const events = eventsQuery.data ?? [];
  const searching = term.trim().length > 0;
  const error = (loadsQuery.error ?? eventsQuery.error) as Error | undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trailer Search</h1>
        <p className="text-sm text-muted-foreground">
          Searches every load — including archived ones — plus comments, status and the full event
          history.
        </p>
      </div>

      <div className="kpi-card p-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Trailer number, schedule ID, driver, store, comment, status…"
            className="w-full pl-10 pr-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm outline-none focus:border-primary/50"
          />
        </div>
        {searching && (
          <div className="mt-2 text-xs text-muted-foreground">
            {loadsQuery.isFetching
              ? "Searching…"
              : `${total} load${total === 1 ? "" : "s"} · ${events.length} history entries`}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="kpi-card p-4 text-sm text-danger">
          Search failed: {error.message}
        </div>
      )}

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Sch ID</th>
                <th className="text-left font-medium py-3 px-4">Date</th>
                <th className="text-left font-medium py-3 px-4">Driver</th>
                <th className="text-left font-medium py-3 px-4">Store</th>
                <th className="text-left font-medium py-3 px-4">Outbound</th>
                <th className="text-left font-medium py-3 px-4">Return</th>
                <th className="text-left font-medium py-3 px-4">Location</th>
                <th className="text-left font-medium py-3 px-4">Yard Time</th>
                <th className="text-left font-medium py-3 px-4">Status</th>
                <th className="text-right font-medium py-3 px-4">History</th>
              </tr>
            </thead>
            <tbody>
              {!searching && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Start typing to search.
                  </td>
                </tr>
              )}
              {searching && !loadsQuery.isFetching && results.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    No matching loads.
                  </td>
                </tr>
              )}
              {results.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-border/40 last:border-0 hover:bg-surface-2/30"
                >
                  <td className="py-2.5 px-4 font-mono text-xs">{l.schedule_id}</td>
                  <td className="py-2.5 px-4 text-xs tabular-nums">{l.schedule_date}</td>
                  <td className="py-2.5 px-4">{l.driver ?? "—"}</td>
                  <td className="py-2.5 px-4">
                    {l.str_number} · <span className="text-muted-foreground">{l.str_name}</span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.outbound_trailer}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.return_trailer ?? "—"}</td>
                  <td className="py-2.5 px-4">
                    {l.return_trailer_location && (
                      <LocationChip location={l.return_trailer_location} />
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <YardChip hours={yardHours(l.yard_arrival_at)} />
                  </td>
                  <td className="py-2.5 px-4">
                    {l.status && <StatusChip status={l.status as LoadStatus} />}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Link
                      to="/history/$loadId"
                      params={{ loadId: l.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {searching && total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
            <span className="text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
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
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border px-2.5 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {searching && events.length > 0 && (
        <div className="kpi-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Matching history entries
          </div>
          <div className="divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-xs tabular-nums text-muted-foreground w-40">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <span className="font-mono text-xs">{e.trailer_number ?? "—"}</span>
                {e.trailer_role && (
                  <span className="chip border bg-muted text-muted-foreground border-border">
                    {e.trailer_role}
                  </span>
                )}
                <span className="font-medium">{e.event_type}</span>
                <span className="flex-1 min-w-[160px] truncate text-muted-foreground">
                  {e.note ?? ""}
                </span>
                {e.load_id && (
                  <Link
                    to="/history/$loadId"
                    params={{ loadId: e.load_id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open load →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

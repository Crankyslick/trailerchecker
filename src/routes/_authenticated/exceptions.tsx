import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useExceptions, resolveException, type ExceptionLoad } from "@/hooks/use-driver";

export const Route = createFileRoute("/_authenticated/exceptions")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Exceptions — Me Do Logistics" }] }),
  component: ExceptionsPage,
});

function ExceptionsPage() {
  const { data: loads, isLoading } = useExceptions();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-danger" /> Exceptions
        </h1>
        <p className="text-sm text-muted-foreground">
          Loads flagged by a driver or dispatcher, awaiting resolution.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (loads ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">
          No open exceptions. Everything's moving cleanly.
        </div>
      )}

      <div className="space-y-2">
        {(loads ?? []).map((load) => (
          <ExceptionRow key={load.id} load={load} />
        ))}
      </div>
    </div>
  );
}

function ExceptionRow({ load }: { load: ExceptionLoad }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try {
      await resolveException(load.id, note || null);
      toast.success("Exception resolved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-xs text-muted-foreground">{load.schedule_id}</span>
        <span className="chip border bg-primary/10 text-primary border-primary/30">
          {load.status}
        </span>
      </div>
      <div className="text-sm">
        {load.origin_name ?? "—"} → {load.str_name ?? "—"}
        {load.driver && <span className="text-muted-foreground"> · Driver: {load.driver}</span>}
      </div>
      <div className="text-sm text-danger bg-danger/10 rounded-md p-2">{load.exception_reason}</div>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
          placeholder="Resolution note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          onClick={resolve}
          disabled={busy}
          className="rounded-md bg-success text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {busy ? "Resolving…" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

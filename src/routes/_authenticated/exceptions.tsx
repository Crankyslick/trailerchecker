import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FolderOpen, Plus } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useExceptions, resolveException, type ExceptionLoad } from "@/hooks/use-driver";
import { ExceptionCaseModal } from "@/components/ExceptionCaseModal";
import {
  billableHours,
  label,
  useExceptionCases,
  type ExceptionCase,
} from "@/hooks/use-exception-cases";

export const Route = createFileRoute("/_authenticated/exceptions")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({
    meta: [
      { title: "Exceptions & claim cases — Me Do Logistics" },
      {
        name: "description",
        content:
          "Resolve flagged loads and build detention, layover and damage claim cases with evidence.",
      },
      { property: "og:title", content: "Exceptions & claim cases — Me Do Logistics" },
      {
        property: "og:description",
        content:
          "Resolve flagged loads and build detention, layover and damage claim cases with evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExceptionsPage,
});

function ExceptionsPage() {
  const [tab, setTab] = useState<"flagged" | "cases">("flagged");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-danger" /> Exceptions
        </h1>
        <p className="text-sm text-muted-foreground">
          Flagged loads awaiting resolution, plus claim cases with their evidence.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["flagged", "Flagged loads"],
            ["cases", "Claim cases"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm border ${
              tab === key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "flagged" ? <FlaggedLoads /> : <ClaimCases />}
    </div>
  );
}

function FlaggedLoads() {
  const { data: loads, isLoading } = useExceptions();

  return (
    <div className="space-y-2">
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (loads ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">
          No open exceptions. Everything's moving cleanly.
        </div>
      )}
      {(loads ?? []).map((load) => (
        <ExceptionRow key={load.id} load={load} />
      ))}
    </div>
  );
}

const CASE_TONE: Record<string, string> = {
  OPEN: "bg-danger/10 text-danger border-danger/30",
  EVIDENCE_READY: "bg-warning/10 text-warning border-warning/30",
  IN_REVIEW: "bg-primary/10 text-primary border-primary/30",
  RESOLVED: "bg-success/10 text-success border-success/30",
  WRITTEN_OFF: "bg-muted text-muted-foreground border-border",
};

function money(v: number | null, currency: string) {
  if (v == null) return "—";
  return `${currency} ${Number(v).toFixed(2)}`;
}

function ClaimCases() {
  const { data: cases, isLoading } = useExceptionCases();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExceptionCase | null>(null);

  const open = (c: ExceptionCase | null) => {
    setEditing(c);
    setModalOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => open(null)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New case
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (cases ?? []).length === 0 && (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          <FolderOpen className="mx-auto mb-2 h-5 w-5" />
          No claim cases yet. Start one when a load sits too long, comes back wrong, or costs you
          extra money.
        </div>
      )}

      <div className="space-y-2">
        {(cases ?? []).map((c) => {
          const hours = billableHours(c);
          return (
            <button
              key={c.id}
              onClick={() => open(c)}
              className="w-full text-left rounded-lg border border-border bg-surface p-3 space-y-2 hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label(c.exception_type)}</span>
                <span
                  className={`chip border text-xs ${CASE_TONE[c.case_status] ?? "border-border"}`}
                >
                  {label(c.case_status)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(c.occurred_at).toLocaleString()}
                {c.facility_name ? ` · ${c.facility_name}` : ""}
                {c.trailer_number ? ` · Trailer ${c.trailer_number}` : ""}
                {hours != null ? ` · ${hours.toFixed(1)} h billable` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Carrier pay: </span>
                  {label(c.carrier_claim_status)} ·{" "}
                  {money(c.carrier_amount_claimed, c.currency_code)}
                </div>
                <div>
                  <span className="text-muted-foreground">Customer bill: </span>
                  {label(c.customer_claim_status)} ·{" "}
                  {money(c.customer_amount_claimed, c.currency_code)}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <ExceptionCaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={editing}
      />
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

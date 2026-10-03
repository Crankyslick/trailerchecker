import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  AGING_BUCKETS,
  useInvoiceAging,
  usePendingAccessorials,
  approveAccessorial,
  rejectAccessorial,
  disputeInvoice,
  resolveDispute,
  markInvoiceSent,
} from "@/hooks/use-commercial";

const LABEL: Record<(typeof AGING_BUCKETS)[number], string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};
const TONE: Record<(typeof AGING_BUCKETS)[number], string> = {
  current: "text-success",
  "1-30": "text-foreground",
  "31-60": "text-warning",
  "61-90": "text-danger",
  "90+": "text-danger",
};

export function ReceivablesPanel({ canApprove }: { canApprove: boolean }) {
  const { data: aging = [] } = useInvoiceAging();
  const { data: pending = [], refetch } = usePendingAccessorials();

  async function act(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold mb-2">Money owed to you (by age)</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {AGING_BUCKETS.map((b) => {
            const rows = aging.filter((a) => a.aging_bucket === b);
            const sum = rows.reduce((s, a) => s + Number(a.total_amount), 0);
            return (
              <div key={b} className="kpi-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{LABEL[b]}</div>
                <div className={`text-lg font-semibold ${TONE[b]}`}>${sum.toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground">{rows.length} invoice{rows.length === 1 ? "" : "s"}</div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Counts sent and disputed invoices; drafts and paid ones are excluded.</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Extra charges waiting for approval</h2>
        {pending.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nothing waiting.</div>
        ) : (
          <div className="space-y-1.5">
            {pending.map((a) => (
              <div key={a.id} className="rounded-md border border-border p-2 flex items-center justify-between text-sm">
                <span>
                  <span className="font-mono text-xs">{a.trailer_loads?.schedule_id ?? "—"}</span> · {a.code}
                  {a.description ? `: ${a.description}` : ""}
                  <span className="text-xs text-muted-foreground"> · bill to {a.billable_to.toLowerCase()}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">${Number(a.amount).toFixed(2)}</span>
                  {canApprove ? (
                    <>
                      <button onClick={() => act(() => approveAccessorial(a.id), "Approved")} className="inline-flex items-center gap-1 rounded-md border border-success/40 text-success px-2 py-1 text-[11px]"><Check className="h-3 w-3" /> Approve</button>
                      <button
                        onClick={() => {
                          const reason = window.prompt("Reason for rejecting?");
                          if (reason) void act(() => rejectAccessorial(a.id, reason), "Rejected");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-danger/40 text-danger px-2 py-1 text-[11px]"
                      ><X className="h-3 w-3" /> Reject</button>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Owner/admin approves</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function InvoiceActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const btn = "rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-surface-2 disabled:opacity-50";
  if (status === "DRAFT")
    return <button disabled={busy} className={btn} onClick={() => run(() => markInvoiceSent(id), "Marked as sent")}>Mark sent</button>;
  if (status === "SENT")
    return (
      <button
        disabled={busy}
        className={btn}
        onClick={() => {
          const reason = window.prompt("What is the customer disputing?");
          if (reason) void run(() => disputeInvoice(id, reason), "Dispute recorded");
        }}
      >Dispute</button>
    );
  if (status === "DISPUTED")
    return (
      <span className="flex gap-1">
        <button disabled={busy} className={btn} onClick={() => run(() => resolveDispute(id, "SENT"), "Back to open")}>Resolve</button>
        <button disabled={busy} className={btn} onClick={() => run(() => resolveDispute(id, "PAID"), "Marked paid")}>Paid</button>
        <button disabled={busy} className={btn} onClick={() => run(() => resolveDispute(id, "VOID"), "Voided")}>Void</button>
      </span>
    );
  return null;
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Send } from "lucide-react";
import { guard } from "@/lib/route-guard";
import {
  useTenderBoard,
  useTenderStatus,
  useCarriers,
  useCreateTender,
  useRespondToTender,
  type PlanningLeg,
} from "@/hooks/use-tendering";

export const Route = createFileRoute("/_authenticated/tenders")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Tenders — Me Do Logistics" }] }),
  component: TendersPage,
});

function TendersPage() {
  const { notTendered, pending, resolved, isLoading } = useTenderBoard();
  const [tenderTarget, setTenderTarget] = useState<PlanningLeg | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tenders</h1>
        <p className="text-sm text-muted-foreground">
          Send loads to carriers and track their response.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="grid md:grid-cols-3 gap-4">
        <Column title="Not Tendered" count={notTendered.length}>
          {notTendered.map((leg) => (
            <LoadCard key={leg.id} leg={leg} onSendTender={() => setTenderTarget(leg)} />
          ))}
          {notTendered.length === 0 && <Empty text="Nothing waiting to be tendered." />}
        </Column>

        <Column title="Offered / Pending" count={pending.length}>
          {pending.map((leg) => (
            <LoadCard key={leg.id} leg={leg} onSendTender={() => setTenderTarget(leg)} />
          ))}
          {pending.length === 0 && <Empty text="No tenders awaiting a response." />}
        </Column>

        <Column title="Accepted / Rejected" count={resolved.length}>
          {resolved.map((leg) => (
            <LoadCard key={leg.id} leg={leg} onSendTender={() => setTenderTarget(leg)} />
          ))}
          {resolved.length === 0 && <Empty text="Nothing resolved yet." />}
        </Column>
      </div>

      {tenderTarget && <TenderModal leg={tenderTarget} onClose={() => setTenderTarget(null)} />}
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
      {text}
    </div>
  );
}

const TENDER_STATUS_STYLE: Record<string, string> = {
  OFFERED: "bg-warning/10 text-warning border-warning/30",
  ACCEPTED: "bg-success/10 text-success border-success/30",
  REJECTED: "bg-danger/10 text-danger border-danger/30",
  EXPIRED: "bg-surface-2 text-muted-foreground border-border",
  RESCINDED: "bg-surface-2 text-muted-foreground border-border",
};

function LoadCard({ leg, onSendTender }: { leg: PlanningLeg; onSendTender: () => void }) {
  const { tender, canRetender } = useTenderStatus(leg);
  const respond = useRespondToTender();
  const load = leg.loads?.[0];

  async function handleRespond(response: "ACCEPTED" | "REJECTED") {
    if (!tender) return;
    try {
      await respond.mutateAsync({ tenderId: tender.id, response });
      toast.success(response === "ACCEPTED" ? "Tender accepted" : "Tender rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update tender");
    }
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-surface">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-mono text-xs text-muted-foreground">
          {leg.shipments?.shipment_number ?? "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span>{leg.origin?.location_name ?? "—"}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span>{leg.destination?.location_name ?? "—"}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip border bg-primary/10 text-primary border-primary/30 text-[10px]">
          {load?.status ?? leg.status}
        </span>
        {tender && (
          <span className={`chip border text-[10px] ${TENDER_STATUS_STYLE[tender.status]}`}>
            {tender.status}
          </span>
        )}
      </div>

      {tender && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 shrink-0" />
          {tender.offered_rate != null ? `$${tender.offered_rate}` : "no rate set"}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {tender?.status === "OFFERED" && (
          <>
            <button
              onClick={() => handleRespond("ACCEPTED")}
              disabled={respond.isPending}
              className="flex-1 rounded-md bg-success text-white py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond("REJECTED")}
              disabled={respond.isPending}
              className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {canRetender && (
          <button
            onClick={onSendTender}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground py-1.5 text-xs font-medium hover:opacity-90"
          >
            <Send className="h-3 w-3" /> {tender ? "Re-Tender" : "Send Tender"}
          </button>
        )}
      </div>
    </div>
  );
}

function TenderModal({ leg, onClose }: { leg: PlanningLeg; onClose: () => void }) {
  const { data: carriers } = useCarriers();
  const createTender = useCreateTender();
  const [carrierId, setCarrierId] = useState("");
  const [rate, setRate] = useState("");

  async function confirm() {
    if (!carrierId) {
      toast.error("Pick a carrier");
      return;
    }
    try {
      await createTender.mutateAsync({
        legId: leg.id,
        carrierId,
        offeredRate: rate ? Number(rate) : null,
      });
      toast.success("Tender sent");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send tender");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          Send Tender — {leg.shipments?.shipment_number}
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="text-xs text-muted-foreground">
            {leg.origin?.location_name ?? "—"} → {leg.destination?.location_name ?? "—"}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Carrier *</label>
            <select
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={carrierId}
              onChange={(e) => setCarrierId(e.target.value)}
            >
              <option value="">— select —</option>
              {(carriers ?? [])
                .filter((c) => c.status === "ACTIVE")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Rate offered ($)</label>
            <input
              type="number"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={createTender.isPending}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {createTender.isPending ? "Sending…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

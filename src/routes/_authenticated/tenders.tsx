import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Link2, Mail, Send } from "lucide-react";
import {
  useTenderBoard,
  useTenderStatus,
  useCarriers,
  useCreateTender,
  useRespondToTender,
  type PlanningLeg,
} from "@/hooks/use-tendering";
import type { Carrier } from "@/hooks/use-orders";
import { useBusinessModel } from "@/hooks/use-company-settings";
import {
  businessModelLabel,
  buildTenderMailto,
  buildTenderResponseUrl,
  validateOfferedRate,
} from "@/lib/brokerage";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/tenders")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Tenders — Me Do Logistics" }] }),
  component: TendersPage,
});

function TendersPage() {
  const { notTendered, pending, resolved, isLoading } = useTenderBoard();
  const { model } = useBusinessModel();
  const { data: carriers = [] } = useCarriers();
  const [tenderTarget, setTenderTarget] = useState<PlanningLeg | null>(null);
  const title =
    model === "FREIGHT_BROKER"
      ? "Freight Broker Desk"
      : model === "HYBRID"
        ? "Broker & Carrier Tenders"
        : "Partner Carrier Tenders";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-primary">
          {businessModelLabel(model)}
        </div>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Record carrier offers and log the response after the carrier contacts your team.
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface-2/40 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Carrier self-service:</strong> every offer gets a
        zero-login link the carrier can open to accept or decline with one click — no account or EDI
        integration needed. Use the email-draft button (or copy the link) to send it.
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Column title="Needs carrier" count={notTendered.length}>
          {notTendered.map((leg) => (
            <LoadCard
              key={leg.id}
              leg={leg}
              carriers={carriers}
              onSendTender={() => setTenderTarget(leg)}
            />
          ))}
          {notTendered.length === 0 && <Empty text="Nothing waiting for carrier coverage." />}
        </Column>

        <Column title="Offer awaiting reply" count={pending.length}>
          {pending.map((leg) => (
            <LoadCard
              key={leg.id}
              leg={leg}
              carriers={carriers}
              onSendTender={() => setTenderTarget(leg)}
            />
          ))}
          {pending.length === 0 && <Empty text="No carrier offers awaiting a reply." />}
        </Column>

        <Column title="Accepted / resolved" count={resolved.length}>
          {resolved.map((leg) => (
            <LoadCard
              key={leg.id}
              leg={leg}
              carriers={carriers}
              onSendTender={() => setTenderTarget(leg)}
            />
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
      <div className="min-h-[60px] space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
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

function LoadCard({
  leg,
  carriers,
  onSendTender,
}: {
  leg: PlanningLeg;
  carriers: Carrier[];
  onSendTender: () => void;
}) {
  const { tender, canRetender } = useTenderStatus(leg);
  const respond = useRespondToTender();
  const load = leg.loads?.[0];
  const carrier = tender
    ? carriers.find((candidate) => candidate.id === tender.carrier_id)
    : undefined;

  async function handleRespond(response: "ACCEPTED" | "REJECTED") {
    if (!tender) return;
    try {
      await respond.mutateAsync({ tenderId: tender.id, response });
      toast.success(
        response === "ACCEPTED" ? "Carrier acceptance recorded" : "Carrier rejection recorded",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update tender");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-mono text-xs text-muted-foreground">
          {leg.shipments?.shipment_number ?? "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span>{leg.origin?.location_name ?? "—"}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span>{leg.destination?.location_name ?? "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip border border-primary/30 bg-primary/10 text-[10px] text-primary">
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
          {carrier?.name ?? "Carrier"} ·{" "}
          {tender.offered_rate != null
            ? `$${Number(tender.offered_rate).toFixed(2)}`
            : "no rate set"}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        {tender?.status === "OFFERED" && (
          <>
            <button
              onClick={() => void handleRespond("ACCEPTED")}
              disabled={respond.isPending}
              className="flex-1 rounded-md bg-success py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Log acceptance
            </button>
            <button
              onClick={() => void handleRespond("REJECTED")}
              disabled={respond.isPending}
              className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              Log rejection
            </button>
          </>
        )}
        {canRetender && (
          <button
            onClick={onSendTender}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Send className="h-3 w-3" />
            {tender ? "Create replacement offer" : "Create offer"}
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
  const [mailto, setMailto] = useState<string | null>(null);
  const [responseUrl, setResponseUrl] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const carrier = carriers?.find((candidate) => candidate.id === carrierId);

  async function confirm() {
    if (!carrierId) return toast.error("Pick a carrier.");
    const invalidRate = validateOfferedRate(rate);
    if (invalidRate) return toast.error(invalidRate);
    try {
      const { responseToken } = await createTender.mutateAsync({
        legId: leg.id,
        carrierId,
        offeredRate: rate.trim() ? Number(rate) : null,
      });
      const url = buildTenderResponseUrl(responseToken);
      setResponseUrl(url);
      setMailto(
        buildTenderMailto({
          recipient: carrier?.contact_email,
          shipmentNumber: leg.shipments?.shipment_number,
          origin: leg.origin?.location_name,
          destination: leg.destination?.location_name,
          offeredRate: rate.trim() ? Number(rate) : null,
          responseUrl: url,
        }),
      );
      setRecorded(true);
      toast.success("Tender recorded — carrier can accept or decline from their own link.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record tender");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Create carrier offer — {leg.shipments?.shipment_number}
        </div>
        <div className="space-y-3 p-4 text-sm">
          <div className="text-xs text-muted-foreground">
            {leg.origin?.location_name ?? "—"} → {leg.destination?.location_name ?? "—"}
          </div>
          {!recorded ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Carrier *</span>
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
                        {c.contact_email ? ` · ${c.contact_email}` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Carrier pay offered ($)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Saving records an offer and associates the carrier with the load. You must contact
                the carrier separately and log its response when it arrives.
              </p>
            </>
          ) : (
            <div className="space-y-3 rounded-md border border-border bg-surface-2/40 p-3">
              <p className="text-xs">
                <strong>Tender record created.</strong> The carrier can accept or decline from their
                own link — staff can also log the reply here if the carrier contacts you another
                way.
              </p>
              <div className="flex flex-wrap gap-2">
                {mailto && (
                  <a
                    href={mailto}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Open email draft
                  </a>
                )}
                {responseUrl && (
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(responseUrl).then(
                        () => toast.success("Link copied"),
                        () => toast.error("Could not copy link"),
                      );
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-2"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Copy carrier link
                  </button>
                )}
              </div>
              {!mailto && (
                <p className="text-xs text-warning">
                  No carrier contact email is saved — copy the link above and send it through your
                  usual channel.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Opening a draft does not send the message. The carrier link requires no account.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {recorded ? "Close" : "Cancel"}
          </button>
          {!recorded && (
            <button
              onClick={() => void confirm()}
              disabled={createTender.isPending || !carrierId}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {createTender.isPending ? "Recording…" : "Record offer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

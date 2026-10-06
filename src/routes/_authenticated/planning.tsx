import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  User,
  Truck,
  CheckCircle2,
  Building2,
  Mail,
  Link2,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { guard } from "@/lib/route-guard";
import {
  usePlanningLegs,
  useEquipment,
  useCarriers,
  useTractors,
  useBrokers,
  useRateConfirmations,
  planLeg,
  createTender,
  respondToTender,
  assignLoadParties,
  createRateConfirmation,
  type PlanningLeg,
  type Carrier,
} from "@/hooks/use-orders";
import { useDrivers } from "@/hooks/use-drivers";
import { buildTenderMailto, buildTenderResponseUrl, validateOfferedRate } from "@/lib/brokerage";

export const Route = createFileRoute("/_authenticated/planning")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Load Planning — Me Do Logistics" }] }),
  component: PlanningPage,
});

function PlanningPage() {
  const { data: legs, isLoading } = usePlanningLegs();
  const { data: drivers } = useDrivers();
  const { data: equipment } = useEquipment();
  const { data: carriers } = useCarriers();
  const [onlyUnplanned, setOnlyUnplanned] = useState(true);

  const rows = (legs ?? []).filter((leg) => {
    if (!onlyUnplanned) return true;
    const load = leg.loads?.[0];
    const ownFleetPlanned = !!(load?.driver_id && load?.equipment_id);
    const carrierPlanned = !!load?.carrier_id;
    return !ownFleetPlanned && !carrierPlanned;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Load Planning</h1>
          <p className="text-sm text-muted-foreground">
            Dispatch a leg with your own driver + trailer, or record a carrier offer. Offer records
            do not contact carriers; use the email draft or another channel and log the reply.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyUnplanned}
            onChange={(e) => setOnlyUnplanned(e.target.checked)}
            className="rounded border-border"
          />
          Only show unplanned legs
        </label>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">
          {onlyUnplanned ? "Every leg is planned." : "No legs yet."}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((leg) => (
          <PlanningRow
            key={leg.id}
            leg={leg}
            drivers={drivers ?? []}
            equipment={equipment ?? []}
            carriers={carriers ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function PlanningRow({
  leg,
  drivers,
  equipment,
  carriers,
}: {
  leg: PlanningLeg;
  drivers: { id: string; name: string; active: boolean }[];
  equipment: { id: string; equipment_number: string; equipment_type: string }[];
  carriers: Carrier[];
}) {
  const load = leg.loads?.[0];
  const openTender = leg.tenders?.find((t) => t.status === "OFFERED");
  const isOwnFleetPlanned = !!(load?.driver_id && load?.equipment_id);
  const isCarrierPlanned = !!load?.carrier_id;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2.5 ${
        isOwnFleetPlanned || isCarrierPlanned ? "border-success/30 bg-success/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        {(isOwnFleetPlanned || isCarrierPlanned) && (
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {leg.shipments?.shipment_number ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          {leg.origin?.location_name ?? "—"}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {leg.destination?.location_name ?? "—"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <OwnFleetControls
          leg={leg}
          load={load}
          drivers={drivers}
          equipment={equipment}
          disabled={isCarrierPlanned}
        />
        <span className="text-xs text-muted-foreground">or</span>
        <CarrierControls
          leg={leg}
          carriers={carriers}
          openTender={openTender}
          disabled={isOwnFleetPlanned}
        />
      </div>

      {load?.id && !isCarrierPlanned && <FleetDetailsControls load={load} />}
    </div>
  );
}

/**
 * Optional, in-house-only extras — tractor, broker (who tendered this
 * freight in), and a rate confirmation. None of these are required: a load
 * with only a driver and a trailer is already complete. Collapsed by
 * default so a dispatcher who doesn't need them never sees the extra
 * fields.
 */
function FleetDetailsControls({ load }: { load: PlanningLeg["loads"][number] }) {
  const [open, setOpen] = useState(false);
  const { data: tractors } = useTractors();
  const { data: brokers } = useBrokers();
  const { data: rateConfirmations } = useRateConfirmations();
  const [rcModalOpen, setRcModalOpen] = useState(false);

  const currentRc = rateConfirmations?.find((rc) => rc.id === load.rate_confirmation_id);

  async function setTractor(tractorId: string) {
    try {
      await assignLoadParties({ loadId: load.id, tractorId: tractorId || null });
      toast.success("Tractor assigned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign tractor");
    }
  }

  async function setBroker(brokerId: string) {
    try {
      await assignLoadParties({ loadId: load.id, brokerId: brokerId || null });
      toast.success("Broker assigned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign broker");
    }
  }

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Tractor, broker & rate confirmation
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm min-w-[140px]"
              value={load.tractor_id ?? ""}
              onChange={(e) => void setTractor(e.target.value)}
            >
              <option value="">— tractor —</option>
              {(tractors ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unit_number}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm min-w-[140px]"
              value={load.broker_id ?? ""}
              onChange={(e) => void setBroker(e.target.value)}
            >
              <option value="">— broker —</option>
              {(brokers ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {currentRc ? (
              <span className="text-muted-foreground">
                RC {currentRc.rc_number ?? currentRc.id.slice(0, 8)}
                {currentRc.total_rate != null && ` · $${Number(currentRc.total_rate).toFixed(2)}`}
              </span>
            ) : (
              <button
                onClick={() => setRcModalOpen(true)}
                className="rounded-md border border-border px-2.5 py-1.5 font-medium hover:bg-surface-2"
              >
                + Rate confirmation
              </button>
            )}
          </div>
        </div>
      )}

      {rcModalOpen && (
        <RateConfirmationModal
          load={load}
          brokerId={load.broker_id}
          onClose={() => setRcModalOpen(false)}
        />
      )}
    </div>
  );
}

function RateConfirmationModal({
  load,
  brokerId,
  onClose,
}: {
  load: PlanningLeg["loads"][number];
  brokerId: string | null;
  onClose: () => void;
}) {
  const [rcNumber, setRcNumber] = useState("");
  const [totalRate, setTotalRate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const id = await createRateConfirmation({
        rcNumber: rcNumber || null,
        brokerId: brokerId ?? null,
        totalRate: totalRate ? Number(totalRate) : null,
      });
      await assignLoadParties({ loadId: load.id, rateConfirmationId: id });
      toast.success("Rate confirmation created and attached");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rate confirmation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          New Rate Confirmation
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">RC number</label>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={rcNumber}
              onChange={(e) => setRcNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Total rate $</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={totalRate}
              onChange={(e) => setTotalRate(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The hauling carrier's own MC/DOT default to this company's authority automatically.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create & attach"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnFleetControls({
  leg,
  load,
  drivers,
  equipment,
  disabled,
}: {
  leg: PlanningLeg;
  load: PlanningLeg["loads"][number] | undefined;
  drivers: { id: string; name: string; active: boolean }[];
  equipment: { id: string; equipment_number: string; equipment_type: string }[];
  disabled: boolean;
}) {
  const [driverId, setDriverId] = useState(load?.driver_id ?? "");
  const [equipmentId, setEquipmentId] = useState(load?.equipment_id ?? "");
  const [saving, setSaving] = useState(false);
  const isPlanned = !!(load?.driver_id && load?.equipment_id);

  async function submit() {
    if (!driverId && !equipmentId) {
      toast.error("Pick a driver or trailer first");
      return;
    }
    setSaving(true);
    try {
      await planLeg({
        legId: leg.id,
        driverId: driverId || null,
        equipmentId: equipmentId || null,
      });
      toast.success("Leg planned — visible on the Shipment and Load Board");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to plan leg");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        disabled={disabled}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm min-w-[140px] disabled:opacity-40"
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
      >
        <option value="">— driver —</option>
        {drivers
          .filter((d) => d.active)
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
      </select>
      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        disabled={disabled}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm min-w-[140px] disabled:opacity-40"
        value={equipmentId}
        onChange={(e) => setEquipmentId(e.target.value)}
      >
        <option value="">— trailer —</option>
        {equipment.map((eq) => (
          <option key={eq.id} value={eq.id}>
            {eq.equipment_number}
          </option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={saving || disabled}
        className="rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "Saving…" : isPlanned ? "Update" : "Dispatch"}
      </button>
    </div>
  );
}

function CarrierControls({
  leg,
  carriers,
  openTender,
  disabled,
}: {
  leg: PlanningLeg;
  carriers: Carrier[];
  openTender: PlanningLeg["tenders"][number] | undefined;
  disabled: boolean;
}) {
  const [carrierId, setCarrierId] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const tenderCarrier = openTender
    ? carriers.find((carrier) => carrier.id === openTender.carrier_id)
    : undefined;
  const responseUrl = openTender ? buildTenderResponseUrl(openTender.response_token) : null;
  const emailDraft = openTender
    ? buildTenderMailto({
        recipient: tenderCarrier?.contact_email,
        shipmentNumber: leg.shipments?.shipment_number,
        origin: leg.origin?.location_name,
        destination: leg.destination?.location_name,
        offeredRate: openTender.offered_rate,
        responseUrl,
      })
    : null;

  if (openTender) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="chip border bg-warning/10 text-warning border-warning/30">
          Tender offered
        </span>
        <span className="text-muted-foreground">{tenderCarrier?.name ?? "Carrier"}</span>
        {openTender.offered_rate != null && (
          <span className="text-muted-foreground">
            ${Number(openTender.offered_rate).toFixed(2)}
          </span>
        )}
        {emailDraft && (
          <a
            href={emailDraft}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Mail className="h-3 w-3" /> Email draft
          </a>
        )}
        {responseUrl && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(responseUrl).then(
                () => toast.success("Carrier link copied"),
                () => toast.error("Could not copy link"),
              );
            }}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Link2 className="h-3 w-3" /> Copy link
          </button>
        )}
        {!emailDraft && !responseUrl && (
          <span className="text-[11px] text-warning">No carrier email saved</span>
        )}
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await respondToTender({ tenderId: openTender.id, response: "ACCEPTED" });
              toast.success("Carrier acceptance recorded");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-md bg-success text-white px-2 py-1 font-medium disabled:opacity-40"
        >
          Log acceptance
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await respondToTender({ tenderId: openTender.id, response: "REJECTED" });
              toast.success("Carrier rejection recorded");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-md border border-border px-2 py-1 font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Log rejection
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        disabled={disabled}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm min-w-[140px] disabled:opacity-40"
        value={carrierId}
        onChange={(e) => setCarrierId(e.target.value)}
      >
        <option value="">— carrier —</option>
        {carriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        disabled={disabled}
        type="number"
        min="0"
        step="0.01"
        placeholder="Rate $"
        className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-40"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <button
        disabled={busy || disabled || !carrierId}
        onClick={async () => {
          const invalidRate = validateOfferedRate(rate);
          if (invalidRate) {
            toast.error(invalidRate);
            return;
          }
          setBusy(true);
          try {
            await createTender({
              legId: leg.id,
              carrierId,
              offeredRate: rate ? Number(rate) : null,
            });
            toast.success("Offer record created; contact the carrier separately.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to tender");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40"
      >
        {busy ? "Recording…" : "Record offer"}
      </button>
    </div>
  );
}

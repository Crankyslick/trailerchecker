import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Paperclip, Upload } from "lucide-react";
import {
  CASE_STATUSES,
  CLAIM_STATUSES,
  EVIDENCE_KINDS,
  EXCEPTION_TYPES,
  RESPONSIBLE_PARTIES,
  TRAILER_ROLES,
  addEvidence,
  billableHours,
  createExceptionCase,
  evidenceUrl,
  label,
  updateExceptionCase,
  useCaseEvents,
  useCaseEvidence,
  useCaseLoadOptions,
  useInvalidateCases,
  type CaseInput,
  type ClaimStatus,
  type EvidenceKind,
  type ExceptionCase,
  type ExceptionType,
  type CaseStatus,
  type ResponsibleParty,
  type TrailerRole,
} from "@/hooks/use-exception-cases";

type Props = {
  open: boolean;
  onClose: () => void;
  existing: ExceptionCase | null;
};

const field =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground";
const labelCls = "text-xs text-muted-foreground";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ExceptionCaseModal({ open, onClose, existing }: Props) {
  const { data: loads } = useCaseLoadOptions();
  const invalidate = useInvalidateCases();
  const [busy, setBusy] = useState(false);

  const [loadId, setLoadId] = useState("");
  const [type, setType] = useState<ExceptionType>("DETENTION");
  const [status, setStatus] = useState<CaseStatus>("OPEN");
  const [party, setParty] = useState<ResponsibleParty>("UNKNOWN");
  const [trailerRole, setTrailerRole] = useState<TrailerRole>("NOT_APPLICABLE");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [facility, setFacility] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date().toISOString()));
  const [arrivedAt, setArrivedAt] = useState("");
  const [departedAt, setDepartedAt] = useState("");
  const [freeTime, setFreeTime] = useState("");
  const [carrierRate, setCarrierRate] = useState("");
  const [customerRate, setCustomerRate] = useState("");
  const [description, setDescription] = useState("");
  const [carrierClaim, setCarrierClaim] = useState<ClaimStatus>("NOT_APPLICABLE");
  const [customerClaim, setCustomerClaim] = useState<ClaimStatus>("NOT_APPLICABLE");
  const [carrierClaimed, setCarrierClaimed] = useState("");
  const [carrierApproved, setCarrierApproved] = useState("");
  const [carrierPaid, setCarrierPaid] = useState("");
  const [customerClaimed, setCustomerClaimed] = useState("");
  const [customerApproved, setCustomerApproved] = useState("");
  const [customerPaid, setCustomerPaid] = useState("");

  useEffect(() => {
    if (!open) return;
    const c = existing;
    setLoadId(c?.load_id ?? "");
    setType(c?.exception_type ?? "DETENTION");
    setStatus(c?.case_status ?? "OPEN");
    setParty(c?.responsible_party ?? "UNKNOWN");
    setTrailerRole(c?.trailer_role ?? "NOT_APPLICABLE");
    setTrailerNumber(c?.trailer_number ?? "");
    setFacility(c?.facility_name ?? "");
    setOccurredAt(toLocalInput(c?.occurred_at ?? new Date().toISOString()));
    setArrivedAt(toLocalInput(c?.arrived_at ?? null));
    setDepartedAt(toLocalInput(c?.departed_at ?? null));
    setFreeTime(c?.free_time_minutes != null ? String(c.free_time_minutes) : "");
    setCarrierRate(c?.carrier_rate_per_hour != null ? String(c.carrier_rate_per_hour) : "");
    setCustomerRate(c?.customer_rate_per_hour != null ? String(c.customer_rate_per_hour) : "");
    setDescription(c?.description ?? "");
    setCarrierClaim(c?.carrier_claim_status ?? "NOT_APPLICABLE");
    setCustomerClaim(c?.customer_claim_status ?? "NOT_APPLICABLE");
    setCarrierClaimed(c?.carrier_amount_claimed != null ? String(c.carrier_amount_claimed) : "");
    setCarrierApproved(c?.carrier_amount_approved != null ? String(c.carrier_amount_approved) : "");
    setCarrierPaid(c?.carrier_amount_paid != null ? String(c.carrier_amount_paid) : "");
    setCustomerClaimed(c?.customer_amount_claimed != null ? String(c.customer_amount_claimed) : "");
    setCustomerApproved(
      c?.customer_amount_approved != null ? String(c.customer_amount_approved) : "",
    );
    setCustomerPaid(c?.customer_amount_paid != null ? String(c.customer_amount_paid) : "");
  }, [open, existing]);

  if (!open) return null;

  async function save() {
    if (!loadId) {
      toast.error("Pick the load this happened on");
      return;
    }
    const payload: CaseInput = {
      load_id: loadId,
      exception_type: type,
      case_status: status,
      responsible_party: party,
      trailer_role: trailerRole,
      trailer_number: trailerNumber.trim() || null,
      facility_name: facility.trim() || null,
      occurred_at: fromLocalInput(occurredAt) ?? new Date().toISOString(),
      arrived_at: fromLocalInput(arrivedAt),
      departed_at: fromLocalInput(departedAt),
      free_time_minutes: num(freeTime),
      carrier_rate_per_hour: num(carrierRate),
      customer_rate_per_hour: num(customerRate),
      description: description.trim() || null,
      carrier_claim_status: carrierClaim,
      customer_claim_status: customerClaim,
      carrier_amount_claimed: num(carrierClaimed),
      carrier_amount_approved: num(carrierApproved),
      carrier_amount_paid: num(carrierPaid),
      customer_amount_claimed: num(customerClaimed),
      customer_amount_approved: num(customerApproved),
      customer_amount_paid: num(customerPaid),
    };
    setBusy(true);
    try {
      if (existing) {
        await updateExceptionCase(existing.id, payload);
        toast.success("Case updated");
      } else {
        await createExceptionCase(payload);
        toast.success("Case created");
      }
      invalidate(existing?.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the case");
    } finally {
      setBusy(false);
    }
  }

  const hours = existing ? billableHours(existing) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-background p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {existing ? "Exception case" : "New exception case"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className={labelCls}>Load</div>
            <select className={field} value={loadId} onChange={(e) => setLoadId(e.target.value)}>
              <option value="">Select a load…</option>
              {(loads ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.schedule_id} · {l.str_name ?? "—"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>What happened</div>
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value as ExceptionType)}
            >
              {EXCEPTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Case status</div>
            <select
              className={field}
              value={status}
              onChange={(e) => setStatus(e.target.value as CaseStatus)}
            >
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Who we think caused it</div>
            <select
              className={field}
              value={party}
              onChange={(e) => setParty(e.target.value as ResponsibleParty)}
            >
              {RESPONSIBLE_PARTIES.map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Which trailer</div>
            <select
              className={field}
              value={trailerRole}
              onChange={(e) => setTrailerRole(e.target.value as TrailerRole)}
            >
              {TRAILER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Trailer number</div>
            <input
              className={field}
              value={trailerNumber}
              onChange={(e) => setTrailerNumber(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Facility</div>
            <input
              className={field}
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>When it happened</div>
            <input
              type="datetime-local"
              className={field}
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Arrived</div>
            <input
              type="datetime-local"
              className={field}
              value={arrivedAt}
              onChange={(e) => setArrivedAt(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Departed</div>
            <input
              type="datetime-local"
              className={field}
              value={departedAt}
              onChange={(e) => setDepartedAt(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Free time (minutes)</div>
            <input
              className={field}
              inputMode="numeric"
              value={freeTime}
              onChange={(e) => setFreeTime(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Rates per hour (carrier / customer)</div>
            <div className="flex gap-2">
              <input
                className={field}
                inputMode="decimal"
                placeholder="Carrier"
                value={carrierRate}
                onChange={(e) => setCarrierRate(e.target.value)}
              />
              <input
                className={field}
                inputMode="decimal"
                placeholder="Customer"
                value={customerRate}
                onChange={(e) => setCustomerRate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {hours != null && (
          <div className="text-xs text-muted-foreground">
            Billable time beyond free time: {hours.toFixed(2)} h
          </div>
        )}

        <div>
          <div className={labelCls}>Notes</div>
          <textarea
            className={`${field} min-h-20`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Carrier pay side</div>
            <select
              className={field}
              value={carrierClaim}
              onChange={(e) => setCarrierClaim(e.target.value as ClaimStatus)}
            >
              {CLAIM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                className={field}
                placeholder="Claimed"
                inputMode="decimal"
                value={carrierClaimed}
                onChange={(e) => setCarrierClaimed(e.target.value)}
              />
              <input
                className={field}
                placeholder="Approved"
                inputMode="decimal"
                value={carrierApproved}
                onChange={(e) => setCarrierApproved(e.target.value)}
              />
              <input
                className={field}
                placeholder="Paid"
                inputMode="decimal"
                value={carrierPaid}
                onChange={(e) => setCarrierPaid(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Customer bill side</div>
            <select
              className={field}
              value={customerClaim}
              onChange={(e) => setCustomerClaim(e.target.value as ClaimStatus)}
            >
              {CLAIM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                className={field}
                placeholder="Claimed"
                inputMode="decimal"
                value={customerClaimed}
                onChange={(e) => setCustomerClaimed(e.target.value)}
              />
              <input
                className={field}
                placeholder="Approved"
                inputMode="decimal"
                value={customerApproved}
                onChange={(e) => setCustomerApproved(e.target.value)}
              />
              <input
                className={field}
                placeholder="Paid"
                inputMode="decimal"
                value={customerPaid}
                onChange={(e) => setCustomerPaid(e.target.value)}
              />
            </div>
          </div>
        </div>

        {existing && <EvidenceSection caseRow={existing} />}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Close
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : existing ? "Save changes" : "Create case"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EvidenceSection({ caseRow }: { caseRow: ExceptionCase }) {
  const { data: evidence } = useCaseEvidence(caseRow.id);
  const { data: events } = useCaseEvents(caseRow.id);
  const invalidate = useInvalidateCases();
  const [kind, setKind] = useState<EvidenceKind>("PHOTO");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    setBusy(true);
    try {
      await addEvidence({
        caseId: caseRow.id,
        companyId: caseRow.company_id,
        kind,
        note,
        file,
      });
      setNote("");
      setFile(null);
      invalidate(caseRow.id);
      toast.success("Evidence added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add evidence");
    } finally {
      setBusy(false);
    }
  }

  async function open(path: string) {
    try {
      const url = await evidenceUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="text-sm font-medium">Evidence</div>

      <div className="flex flex-col md:flex-row gap-2">
        <select
          className={`${field} md:w-48`}
          value={kind}
          onChange={(e) => setKind(e.target.value as EvidenceKind)}
        >
          {EVIDENCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <input
          className={field}
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-muted-foreground"
        />
        <button
          onClick={upload}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-surface border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <Upload className="h-3 w-3" /> {busy ? "Adding…" : "Add"}
        </button>
      </div>

      <div className="space-y-1">
        {(evidence ?? []).length === 0 && (
          <div className="text-xs text-muted-foreground">Nothing attached yet.</div>
        )}
        {(evidence ?? []).map((ev) => (
          <div key={ev.id} className="flex items-center justify-between text-xs">
            <span>
              <span className="text-muted-foreground">{label(ev.evidence_kind)}</span>{" "}
              {ev.note ?? ""}
            </span>
            {ev.storage_path && (
              <button
                onClick={() => open(ev.storage_path!)}
                className="inline-flex items-center gap-1 text-primary"
              >
                <Paperclip className="h-3 w-3" /> Open
              </button>
            )}
          </div>
        ))}
      </div>

      {(events ?? []).length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">History ({(events ?? []).length})</summary>
          <div className="mt-1 space-y-1">
            {(events ?? []).map((e) => (
              <div key={e.id}>
                {new Date(e.created_at).toLocaleString()} · {e.event_type.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

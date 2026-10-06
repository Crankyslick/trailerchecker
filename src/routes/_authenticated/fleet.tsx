import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Power } from "lucide-react";
import { guard } from "@/lib/route-guard";
import {
  useTractors,
  createTractor,
  updateTractor,
  useBrokers,
  createBroker,
  updateBroker,
  type Tractor,
  type Broker,
} from "@/hooks/use-orders";
import { cleanText, cleanNumber } from "./carriers";

const MC_PREFIX = /^(mc)?[\s#:.-]*/i;

export const Route = createFileRoute("/_authenticated/fleet")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Tractors & Brokers — Me Do Logistics" }] }),
  component: FleetPage,
});

function FleetPage() {
  const [tab, setTab] = useState<"tractors" | "brokers">("tractors");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Tractors & Brokers</h1>
        <p className="text-sm text-muted-foreground">
          Your own power units, and the brokers who tender freight to you — separate from Carriers,
          who you tender freight out to. Neither is required to complete a load: a load with just a
          driver and a trailer is already valid.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("tractors")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "tractors"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Tractors
        </button>
        <button
          onClick={() => setTab("brokers")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "brokers"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Brokers
        </button>
      </div>

      {tab === "tractors" ? <TractorsTab /> : <BrokersTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tractors
// ---------------------------------------------------------------------------

const tractorSchema = z.object({
  unitNumber: z.string().min(1, "Unit number is required").max(40),
  vin: z.string().max(32).optional().or(z.literal("")),
  plateNumber: z.string().max(20).optional().or(z.literal("")),
});
type TractorFormValues = z.infer<typeof tractorSchema>;

function TractorsTab() {
  const { data: tractors, isLoading } = useTractors();
  const [modal, setModal] = useState<"add" | Tractor | null>(null);
  const qc = useQueryClient();

  async function toggleActive(t: Tractor) {
    const next = t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateTractor(t.id, { status: next });
      await qc.invalidateQueries({ queryKey: ["tractors"] });
      toast.success(`${t.unit_number} marked ${next.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update tractor");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setModal("add")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Tractor
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (tractors ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">No tractors yet.</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(tractors ?? []).map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border p-3 space-y-2 ${
              t.status === "ACTIVE" ? "border-border" : "border-border opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm font-mono">{t.unit_number}</div>
                <div className="text-xs text-muted-foreground">
                  {t.plate_number ? `Plate ${t.plate_number}` : "—"}
                  {t.vin ? ` · VIN ${t.vin}` : ""}
                </div>
              </div>
              <span
                className={`chip border text-[10px] shrink-0 ${
                  t.status === "ACTIVE"
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-surface-2 text-muted-foreground border-border"
                }`}
              >
                {t.status}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setModal(t)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => toggleActive(t)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Power className="h-3 w-3" /> {t.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <TractorFormModal tractor={modal === "add" ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function TractorFormModal({ tractor, onClose }: { tractor: Tractor | null; onClose: () => void }) {
  const isEdit = !!tractor;
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TractorFormValues>({
    resolver: zodResolver(tractorSchema),
    defaultValues: {
      unitNumber: tractor?.unit_number ?? "",
      vin: tractor?.vin ?? "",
      plateNumber: tractor?.plate_number ?? "",
    },
  });

  async function onSubmit(values: TractorFormValues) {
    try {
      const payload = {
        unitNumber: values.unitNumber,
        vin: values.vin || null,
        plateNumber: values.plateNumber || null,
      };
      if (isEdit) {
        await updateTractor(tractor.id, payload);
        toast.success("Tractor updated");
      } else {
        await createTractor(payload);
        toast.success("Tractor added");
      }
      await qc.invalidateQueries({ queryKey: ["tractors"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save tractor");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          {isEdit ? "Edit Tractor" : "New Tractor"}
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Field label="Unit number *" error={errors.unitNumber?.message}>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              {...register("unitNumber", { setValueAs: cleanText })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plate" error={errors.plateNumber?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                {...register("plateNumber", { setValueAs: cleanText })}
              />
            </Field>
            <Field label="VIN" error={errors.vin?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                {...register("vin", { setValueAs: cleanText })}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------------

const brokerSchema = z.object({
  name: z.string().min(1, "Broker name is required").max(120),
  mcNumber: z
    .string()
    .regex(/^\d{1,7}$/, "MC number should be 1-7 digits")
    .optional()
    .or(z.literal("")),
  contactName: z.string().max(120).optional().or(z.literal("")),
  contactEmail: z.string().email("Invalid email").max(255).optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
});
type BrokerFormValues = z.infer<typeof brokerSchema>;

function BrokersTab() {
  const { data: brokers, isLoading } = useBrokers();
  const [modal, setModal] = useState<"add" | Broker | null>(null);
  const qc = useQueryClient();

  async function toggleActive(b: Broker) {
    try {
      await updateBroker(b.id, { active: !b.active });
      await qc.invalidateQueries({ queryKey: ["brokers"] });
      toast.success(`${b.name} marked ${b.active ? "inactive" : "active"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update broker");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setModal("add")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Broker
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (brokers ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">No brokers yet.</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(brokers ?? []).map((b) => (
          <div
            key={b.id}
            className={`rounded-lg border p-3 space-y-2 ${
              b.active ? "border-border" : "border-border opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{b.name}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {b.mc_number ? `MC ${b.mc_number}` : "—"}
                </div>
              </div>
              <span
                className={`chip border text-[10px] shrink-0 ${
                  b.active
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-surface-2 text-muted-foreground border-border"
                }`}
              >
                {b.active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            {(b.contact_name || b.contact_email || b.contact_phone) && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {b.contact_name && <div>{b.contact_name}</div>}
                {b.contact_email && <div>{b.contact_email}</div>}
                {b.contact_phone && <div>{b.contact_phone}</div>}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setModal(b)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => toggleActive(b)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Power className="h-3 w-3" /> {b.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <BrokerFormModal broker={modal === "add" ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function BrokerFormModal({ broker, onClose }: { broker: Broker | null; onClose: () => void }) {
  const isEdit = !!broker;
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BrokerFormValues>({
    resolver: zodResolver(brokerSchema),
    defaultValues: {
      name: broker?.name ?? "",
      mcNumber: broker?.mc_number ?? "",
      contactName: broker?.contact_name ?? "",
      contactEmail: broker?.contact_email ?? "",
      contactPhone: broker?.contact_phone ?? "",
    },
  });

  async function onSubmit(values: BrokerFormValues) {
    try {
      const payload = {
        name: values.name,
        mcNumber: values.mcNumber || null,
        contactName: values.contactName || null,
        contactEmail: values.contactEmail || null,
        contactPhone: values.contactPhone || null,
      };
      if (isEdit) {
        await updateBroker(broker.id, payload);
        toast.success("Broker updated");
      } else {
        await createBroker(payload);
        toast.success("Broker added");
      }
      await qc.invalidateQueries({ queryKey: ["brokers"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save broker");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          {isEdit ? "Edit Broker" : "New Broker"}
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Field label="Broker name *" error={errors.name?.message}>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              {...register("name", { setValueAs: cleanText })}
            />
          </Field>
          <Field label="MC #" error={errors.mcNumber?.message}>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
              {...register("mcNumber", { setValueAs: (v) => cleanNumber(v, MC_PREFIX) })}
            />
          </Field>
          <Field label="Contact name">
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              {...register("contactName", { setValueAs: cleanText })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Contact email" error={errors.contactEmail?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                {...register("contactEmail", { setValueAs: cleanText })}
              />
            </Field>
            <Field label="Contact phone">
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                {...register("contactPhone", { setValueAs: cleanText })}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
      {error && <p className="text-[11px] text-danger mt-0.5">{error}</p>}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Power } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useCarriers, createCarrier, updateCarrier, type Carrier } from "@/hooks/use-orders";

export const Route = createFileRoute("/_authenticated/carriers")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Carriers — VTCD Dispatch" }] }),
  component: CarriersPage,
});

// MC# is 1-7 digits, optionally prefixed "MC-"; DOT# is 1-8 digits. Loosely
// validated on purpose — formats vary and a dispatcher shouldn't get blocked
// entering a real number because of an overly strict pattern.
const carrierSchema = z.object({
  name: z.string().min(1, "Carrier name is required"),
  scacCode: z
    .string()
    .regex(/^[A-Z]{2,4}$/, "SCAC is 2-4 letters")
    .optional()
    .or(z.literal("")),
  mcNumber: z
    .string()
    .regex(/^(MC-?)?\d{1,7}$/i, "MC number should look like 123456 or MC-123456")
    .optional()
    .or(z.literal("")),
  dotNumber: z
    .string()
    .regex(/^\d{1,8}$/, "DOT number should be 1-8 digits")
    .optional()
    .or(z.literal("")),
  contactName: z.string().optional().or(z.literal("")),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().optional().or(z.literal("")),
});
type CarrierFormValues = z.infer<typeof carrierSchema>;

function CarriersPage() {
  const { data: carriers, isLoading } = useCarriers();
  const [modal, setModal] = useState<"add" | Carrier | null>(null);

  async function toggleActive(c: Carrier) {
    const next = c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateCarrier(c.id, { status: next });
      toast.success(`${c.name} marked ${next.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update carrier");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Carriers</h1>
          <p className="text-sm text-muted-foreground">Partner fleets you can tender loads to.</p>
        </div>
        <button
          onClick={() => setModal("add")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Carrier
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (carriers ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">No carriers yet.</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(carriers ?? []).map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-3 space-y-2 ${
              c.status === "ACTIVE" ? "border-border" : "border-border opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {c.mc_number ? `MC ${c.mc_number}` : "—"} ·{" "}
                  {c.dot_number ? `DOT ${c.dot_number}` : "—"}
                  {c.scac_code ? ` · ${c.scac_code}` : ""}
                </div>
              </div>
              <span
                className={`chip border text-[10px] shrink-0 ${
                  c.status === "ACTIVE"
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-surface-2 text-muted-foreground border-border"
                }`}
              >
                {c.status}
              </span>
            </div>

            {(c.contact_name || c.contact_email || c.contact_phone) && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {c.contact_name && <div>{c.contact_name}</div>}
                {c.contact_email && <div>{c.contact_email}</div>}
                {c.contact_phone && <div>{c.contact_phone}</div>}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setModal(c)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => toggleActive(c)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Power className="h-3 w-3" /> {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <CarrierFormModal carrier={modal === "add" ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function CarrierFormModal({ carrier, onClose }: { carrier: Carrier | null; onClose: () => void }) {
  const isEdit = !!carrier;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CarrierFormValues>({
    resolver: zodResolver(carrierSchema),
    defaultValues: {
      name: carrier?.name ?? "",
      scacCode: carrier?.scac_code ?? "",
      mcNumber: carrier?.mc_number ?? "",
      dotNumber: carrier?.dot_number ?? "",
      contactName: carrier?.contact_name ?? "",
      contactEmail: carrier?.contact_email ?? "",
      contactPhone: carrier?.contact_phone ?? "",
    },
  });

  async function onSubmit(values: CarrierFormValues) {
    try {
      const payload = {
        name: values.name,
        scacCode: values.scacCode || null,
        mcNumber: values.mcNumber || null,
        dotNumber: values.dotNumber || null,
        contactName: values.contactName || null,
        contactEmail: values.contactEmail || null,
        contactPhone: values.contactPhone || null,
      };
      if (isEdit) {
        await updateCarrier(carrier.id, payload);
        toast.success("Carrier updated");
      } else {
        await createCarrier(payload);
        toast.success("Carrier added");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save carrier");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          {isEdit ? "Edit Carrier" : "New Carrier"}
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Field label="Carrier name *" error={errors.name?.message}>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              {...register("name")}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="SCAC" error={errors.scacCode?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs uppercase"
                {...register("scacCode")}
              />
            </Field>
            <Field label="MC #" error={errors.mcNumber?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                {...register("mcNumber")}
              />
            </Field>
            <Field label="DOT #" error={errors.dotNumber?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                {...register("dotNumber")}
              />
            </Field>
          </div>
          <Field label="Contact name">
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              {...register("contactName")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Contact email" error={errors.contactEmail?.message}>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                {...register("contactEmail")}
              />
            </Field>
            <Field label="Contact phone">
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                {...register("contactPhone")}
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

import { useState } from "react";
import { BriefcaseBusiness, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BUSINESS_MODEL_OPTIONS, type BusinessModel } from "@/lib/brokerage";
import { useBusinessModel, useSaveBusinessModel } from "@/hooks/use-company-settings";

export function BusinessModelCard() {
  const { model, loading, error } = useBusinessModel();
  const save = useSaveBusinessModel();
  const [draft, setDraft] = useState<BusinessModel | null>(null);
  const selected = draft ?? model;
  const dirty = draft != null && draft !== model;

  async function saveModel() {
    if (!draft || !dirty) return;
    try {
      await save.mutateAsync(draft);
      setDraft(null);
      toast.success("Operating profile saved");
    } catch (e) {
      toast.error((e as Error).message || "Unable to save operating profile");
    }
  }

  return (
    <section className="kpi-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-primary" /> Operating profile
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the closest fit. This changes the workspace context, not data access or
          permissions.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {BUSINESS_MODEL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected === option.value}
            disabled={loading || save.isPending}
            onClick={() => setDraft(option.value)}
            className={`rounded-md border p-3 text-left transition disabled:opacity-50 ${
              selected === option.value
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:bg-surface-2/60"
            }`}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {option.label}
              {selected === option.value && <Check className="h-4 w-4 text-primary" />}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {option.description}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="status" className="text-xs text-warning">
          Could not load the saved profile; the asset-based default is being shown. Apply the
          broker-mode migration before saving a different profile.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selected === "FREIGHT_BROKER"
            ? "Broker workflow: customers, orders, carrier coverage, buy/sell rates and billing."
            : selected === "HYBRID"
              ? "The broker and owned-fleet workflows stay available together."
              : "Owned-fleet dispatch stays primary; partner carriers can cover overflow."}
        </p>
        <button
          type="button"
          onClick={() => void saveModel()}
          disabled={!dirty || save.isPending || loading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save profile
        </button>
      </div>
    </section>
  );
}

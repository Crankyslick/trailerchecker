import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your organization — Trailer Checker" },
      { name: "description", content: "Name your organization, count your yards, and pick a plan to finish setup." },
    ],
  }),
  component: Onboarding,
});

const PLANS = [
  { id: "professional", name: "Professional", price: "$40 per user / month", blurb: "Single yard, full compliance ticker." },
  { id: "business", name: "Business", price: "$65 per user / month", blurb: "Multi-yard, roles, sheet sync, reporting." },
  { id: "enterprise", name: "Enterprise", price: "Custom quote", blurb: "SSO, API integrations, SLA and onboarding." },
];


function Onboarding() {
  const navigate = useNavigate();
  const { org, profile, isAdmin, loading, refetch } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [yards, setYards] = useState(1);
  const [plan, setPlan] = useState("starter");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (org?.name && !name) setName(org.name);
    if (org?.yard_count) setYards(org.yard_count);
    if (org?.plan) setPlan(org.plan);
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps

  async function finish() {
    if (!org?.id) { toast.error("No organization linked to your account yet."); return; }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim() || org.name, yard_count: yards, plan, onboarded: true })
        .eq("id", org.id);
      if (error) throw new Error(error.message);
      toast.success("Organization set up.");
      await refetch();
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6 text-primary" /> Organization setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {profile?.full_name ?? profile?.email ?? "—"} · step {step} of 3
        </p>
      </div>

      {!isAdmin && (
        <p className="kpi-card p-4 text-sm text-muted-foreground">
          Only an Admin / DC Manager can change organization settings. Ask your admin to finish setup.
        </p>
      )}

      <div className="kpi-card space-y-4 p-5">
        {step === 1 && (
          <>
            <Label>Company name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vital Transportation Corporation"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
          </>
        )}

        {step === 2 && (
          <>
            <Label>How many yards do you run?</Label>
            <input type="number" min={1} value={yards} onChange={(e) => setYards(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <p className="text-xs text-muted-foreground">Starter is billed per yard; Enterprise covers unlimited yards.</p>
          </>
        )}

        {step === 3 && (
          <>
            <Label>Choose a plan</Label>
            <div className="grid gap-2">
              {PLANS.map((p) => (
                <button key={p.id} onClick={() => setPlan(p.id)}
                  className={`rounded-md border p-4 text-left ${plan === p.id ? "border-primary/60 bg-primary/10" : "border-border hover:bg-surface-2/60"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{p.name}</span>
                    {plan === p.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.price} · {p.blurb}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              No card required today — we'll invoice your organization after setup.
            </p>
          </>
        )}

        <div className="flex justify-between pt-1">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40">
            Back
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={busy || !isAdmin}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{children}</span>;
}

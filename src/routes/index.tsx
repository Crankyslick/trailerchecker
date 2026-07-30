import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck, ShieldCheck, Timer, Radio, Check, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trailer Checker — Yard Compliance & Dispatch Control Tower" },
      { name: "description", content: "Enforce 24-hour trailer turnaround, dispatch drivers, and sync your master sheet in real time. Built for US distribution-center yards." },
      { property: "og:title", content: "Trailer Checker — Yard Compliance & Dispatch Control Tower" },
      { property: "og:description", content: "Real-time yard compliance, 24h turnaround enforcement, and gate check-in for DC operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const TIERS = [
  {
    name: "Starter",
    price: "$499",
    unit: "/mo per yard",
    blurb: "For a single distribution-center yard.",
    features: [
      "1 yard, unlimited trailers",
      "24h compliance ticker & alerts",
      "Dispatch board + driver roster",
      "Gate guard kiosk",
      "Google Sheets two-way sync",
      "Email support",
    ],
  },
  {
    name: "Enterprise",
    price: "$1,299",
    unit: "/mo multi-yard",
    blurb: "For networks running multiple yards.",
    featured: true,
    features: [
      "Unlimited yards & users",
      "Everything in Starter",
      "Role-based access (Admin / Dispatcher / Guard)",
      "Bulk DLM ingestion & batch writeback",
      "Compliance reporting & history export",
      "Priority onboarding + SLA",
    ],
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Truck className="h-5 w-5" />
            </div>
            <span className="truncate text-sm font-bold tracking-tight">Trailer Checker</span>
          </div>
          <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 md:py-24">
          <span className="chip border border-primary/30 bg-primary/10 text-primary">Yard 589 · Chambersburg PA DC proven</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">
            Never blow a 24-hour trailer turnaround again.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Trailer Checker is the compliance control tower for distribution-center yards: live aging clocks,
            gate check-in, next-day driver coverage alerts, and two-way Google Sheets sync.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#pricing" className="inline-flex items-center rounded-md border border-border px-5 py-2.5 text-sm font-semibold hover:bg-surface-2/60">
              See pricing
            </a>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            <Feature icon={Timer} title="Live 24h ticker" body="Every yard trailer counts up to the limit and flashes red on breach." />
            <Feature icon={ShieldCheck} title="Coverage alerts" body="Tomorrow's unassigned drivers go red at 16:00 EST, every day." />
            <Feature icon={Radio} title="Two-way sheet sync" body="Header-matched writeback that survives dispatchers moving columns." />
          </div>
        </section>

        <section id="pricing" className="border-t border-border py-16">
          <h2 className="text-2xl font-bold tracking-tight">Pricing</h2>
          <p className="mt-1 text-sm text-muted-foreground">Flat monthly rate. No per-load fees.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {TIERS.map((t) => (
              <div key={t.name} className={`kpi-card p-6 ${t.featured ? "border !border-primary/50 bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  {t.featured && <span className="chip border border-primary/30 bg-primary/15 text-primary">Most popular</span>}
                </div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-black tracking-tight">{t.price}</span>
                  <span className="pb-1 text-xs text-muted-foreground">{t.unit}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t.blurb}</p>
                <ul className="mt-5 space-y-2">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth"
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold ${
                    t.featured ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-surface-2/60"
                  }`}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Billing is not yet processed in-app — pick a plan during onboarding and our team invoices you directly.
          </p>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Trailer Checker · Vital Transportation Corporation
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="kpi-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

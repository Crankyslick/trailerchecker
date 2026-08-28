import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Truck,
  ShieldCheck,
  Timer,
  Radio,
  ArrowRight,
  LayoutDashboard,
  MapPin,
  Users,
  Warehouse,
  Sheet,
  BellRing,
  BarChart3,
  Building2,
  KeyRound,
  ScrollText,
  Plug,
  Lock,
  Layers,
  AlertTriangle,
  Search,
  ClipboardX,
  CalendarX,
  EyeOff,
  DollarSign,
  Calendar,
} from "lucide-react";
import dashboardHero from "@/assets/dashboard-hero.jpg";
import yardShot from "@/assets/yard-screenshot.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrailerFlow Pro — The TrailerFlow Pro" },
      {
        name: "description",
        content:
          "Manage trailers, drivers, dispatch, and yard operations in one system. Start a free trial — no credit card required.",
      },
      { property: "og:title", content: "TrailerFlow Pro — The TrailerFlow Pro" },
      {
        property: "og:description",
        content:
          "One platform for trailer tracking, dispatch, yard operations, and compliance. Built for trailer and distribution-center fleets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2158693b-f192-4e5f-b358-2ee08281659d/id-preview-f2c4129d--590caa48-69e5-493c-9a2f-88efefd52aed.lovable.app-1782890234292.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2158693b-f192-4e5f-b358-2ee08281659d/id-preview-f2c4129d--590caa48-69e5-493c-9a2f-88efefd52aed.lovable.app-1782890234292.png",
      },
    ],
  }),
  component: Landing,
});

const PROBLEMS = [
  { icon: Search, title: "Lost trailers", body: "Equipment disappears between the yard, the DC, and the driver's memory." },
  { icon: ClipboardX, title: "Manual dispatching", body: "Phone calls and texts decide who moves what — and nothing is auditable." },
  { icon: Layers, title: "Spreadsheet chaos", body: "Five versions of the master sheet, none of them current." },
  { icon: CalendarX, title: "Missed pickups", body: "Tomorrow's loads sit unassigned until it's too late to cover them." },
  { icon: EyeOff, title: "Poor visibility", body: "No one can answer 'where is that trailer and how long has it been there?'" },
];

const FEATURES = [
  { icon: LayoutDashboard, title: "Live Dispatch Board", body: "Every load for today and the days ahead, grouped by date and editable inline." },
  { icon: MapPin, title: "Trailer Tracking", body: "Outbound and return trailers tracked separately, never overwritten." },
  { icon: Users, title: "Driver Assignment", body: "Smart driver picker that surfaces scheduled drivers first and writes back instantly." },
  { icon: Warehouse, title: "Yard Operations", body: "Gate check-in kiosk with auto-stamped arrival times and live aging clocks." },
  { icon: Sheet, title: "Google Sheets Sync", body: "Two-way, header-matched writeback that survives dispatchers moving columns." },
  { icon: BellRing, title: "Compliance Alerts", body: "24-hour turnaround breaches and 16:00 coverage gaps escalate automatically." },
  { icon: BarChart3, title: "Reporting & Analytics", body: "Turn times, detention exposure, and dispatcher throughput in one export." },
];

const ENTERPRISE = [
  { icon: Building2, title: "Multi-tenant", body: "Every record scoped to your organization at the database layer." },
  { icon: Warehouse, title: "Multi-yard", body: "Run one yard or a national network from a single control tower." },
  { icon: KeyRound, title: "Role-based permissions", body: "Admin, dispatcher, and gate guard roles with least-privilege access." },
  { icon: ScrollText, title: "Audit logs", body: "Every trailer event and status change is written to an immutable trail." },
  { icon: Plug, title: "API integrations", body: "Webhooks and REST endpoints to push events into your existing stack." },
  { icon: Lock, title: "Secure authentication", body: "Managed auth with row-level security enforced on every query." },
];

const ROI = [
  { icon: DollarSign, stat: "$3,600+", label: "Detention avoided per month", body: "At $75/hour, catching just four late trailers a week pays for the platform many times over." },
  { icon: Timer, stat: "31%", label: "Less empty trailer dwell", body: "Live aging clocks push empties out of the yard before the free-time window closes." },
  { icon: Calendar, stat: "9 hrs", label: "Dispatcher hours saved weekly", body: "No re-keying, no chasing sheet versions, no manual coverage audits at 4 PM." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Truck className="h-5 w-5" />
            </div>
            <span className="truncate text-sm font-bold tracking-tight">TrailerFlow Pro</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="mailto:sales@trailerchecker.com?subject=Book%20a%20demo"
              className="hidden rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2/60 sm:inline-flex"
            >
              Book a Demo
            </a>
            <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent)]" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <span className="chip border border-primary/30 bg-primary/10 text-primary">
                Proven at Yard 589 · Chambersburg PA DC
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
                TrailerFlow Pro
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                Manage trailers, drivers, dispatch, and yard operations in one system.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:sales@trailerchecker.com?subject=Book%20a%20demo"
                  className="inline-flex items-center rounded-md border border-border px-7 py-3.5 text-sm font-semibold hover:bg-surface-2/60"
                >
                  Book a Demo
                </a>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">No credit card required.</p>
            </div>

            <div className="mt-16 overflow-hidden rounded-xl border border-border shadow-2xl">
              <img
                src={dashboardHero}
                alt="TrailerFlow Pro dispatch dashboard showing live loads, KPI tiles, and trailer status"
                width={1600}
                height={1008}
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* PROBLEMS */}
        <section className="border-b border-border py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <span className="chip border border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="mr-1 inline h-3 w-3" /> The daily reality
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
                Trailer yards still run on guesswork
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Every hour a trailer goes unaccounted for is margin leaving the yard.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((p) => (
                <div key={p.title} className="kpi-card p-6">
                  <p.icon className="h-5 w-5 text-destructive" />
                  <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="border-b border-border py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <span className="chip border border-primary/30 bg-primary/10 text-primary">Platform</span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
                One control tower for the whole operation
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Dispatch, yard, compliance, and reporting in a single system of record.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="kpi-card p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-14 grid items-center gap-10 lg:grid-cols-2">
              <div>
                <h3 className="text-2xl font-bold tracking-tight">Yard aging you can see across the room</h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  Arrival timestamps are stamped automatically the moment a return trailer hits the yard.
                  Under 24 hours is green, 24–48 is yellow, and anything past 48 turns red and escalates —
                  no one has to remember to check.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><Timer className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Live countdowns on every trailer in the yard</li>
                  <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Coverage alerts for unassigned next-day loads</li>
                  <li className="flex items-start gap-2"><Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Real-time updates across every signed-in dispatcher</li>
                </ul>
              </div>
              <div className="overflow-hidden rounded-xl border border-border shadow-xl">
                <img
                  src={yardShot}
                  alt="Yard operations view with trailer aging timers and gate check-in panel"
                  loading="lazy"
                  width={1408}
                  height={912}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ROI */}
        <section className="border-b border-border py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <span className="chip border border-success/30 bg-success/10 text-success">Return on investment</span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
                Thousands back every month, from the first week
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Detention charges, idle equipment, and dispatcher rework are the three most expensive
                habits in the trailer yard. TrailerFlow Pro attacks all three at once.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {ROI.map((r) => (
                <div key={r.label} className="kpi-card p-7">
                  <r.icon className="h-5 w-5 text-success" />
                  <div className="mt-5 text-4xl font-black tracking-tight">{r.stat}</div>
                  <div className="mt-1 text-sm font-semibold">{r.label}</div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              A fleet turning 200 trailers a week that eliminates two detention events and four hours of
              empty dwell per day recovers well over $5,000 a month — before counting the dispatcher hours
              given back to actually covering freight.
            </p>
          </div>
        </section>

        {/* ENTERPRISE */}
        <section className="border-b border-border py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <span className="chip border border-primary/30 bg-primary/10 text-primary">Enterprise ready</span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
                Built for networks, not just one yard
              </h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ENTERPRISE.map((e) => (
                <div key={e.title} className="kpi-card p-6">
                  <e.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 text-base font-semibold">{e.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{e.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-28">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-black tracking-tight md:text-5xl">Start Free Trial</h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Create your organization, import your first DLM, and watch the yard clocks start ticking in
              minutes.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:sales@trailerchecker.com?subject=Book%20a%20demo"
                className="inline-flex items-center rounded-md border border-border px-8 py-4 text-sm font-semibold hover:bg-surface-2/60"
              >
                Book a Demo
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No credit card required.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-6xl px-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} TrailerFlow Pro · Vital Transportation Corporation
        </div>
      </footer>
    </div>
  );
}

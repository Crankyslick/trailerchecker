import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, ClipboardList, DollarSign, Send, Tags, Truck } from "lucide-react";
import { useBusinessModel } from "@/hooks/use-company-settings";
import { useTenderBoard } from "@/hooks/use-tendering";
import { useOrders } from "@/hooks/use-orders";
import { useBillableLoads } from "@/hooks/use-billing";
import { businessModelLabel } from "@/lib/brokerage";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/broker")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Broker Desk — Me Do Logistics" }] }),
  component: BrokerDeskPage,
});

function BrokerDeskPage() {
  const { model } = useBusinessModel();
  const tenders = useTenderBoard();
  const orders = useOrders();
  const billing = useBillableLoads();
  const orderRows = orders.data ?? [];
  const loads = billing.data ?? [];
  const openOrders = orderRows.filter(
    (order) => order.status === "OPEN" || order.status === "PARTIALLY_ALLOCATED",
  ).length;
  const ratedLoads = loads.filter((load) => load.customer_rate != null && load.carrier_pay != null);
  const expectedMargin = ratedLoads.reduce(
    (sum, load) =>
      sum +
      Number(load.customer_rate ?? 0) +
      Number(load.fuel_surcharge_amount ?? 0) -
      Number(load.carrier_pay ?? 0),
    0,
  );
  const title =
    model === "FREIGHT_BROKER"
      ? "Freight Broker Desk"
      : model === "HYBRID"
        ? "Broker & Carrier Desk"
        : "Partner Capacity Desk";
  const subtitle =
    model === "FREIGHT_BROKER"
      ? "Coordinate shipper freight with partner carriers—without requiring an owned fleet."
      : model === "HYBRID"
        ? "Coordinate owned-fleet work and brokered or partner-carrier freight in one workspace."
        : "Coordinate partner-carrier overflow alongside your owned-fleet and yard workflows.";
  const busy = tenders.isLoading || orders.isLoading || billing.isLoading;
  const error = tenders.error || orders.error || billing.error;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-primary">
            {businessModelLabel(model)}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          to="/orders"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <ClipboardList className="h-4 w-4" /> New shipper order
        </Link>
      </header>

      <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Carrier outreach is manual in this release.</strong> A
        tender record does not send email. From Tenders, create the offer and open a carrier email
        draft; after the reply arrives, staff log acceptance or rejection here. No EDI, carrier
        portal, or automated carrier-status integration is enabled.
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {(error as Error).message}
        </div>
      )}
      {busy && <div className="text-sm text-muted-foreground">Loading broker pipeline…</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Open shipper orders"
          value={openOrders}
          icon={<ClipboardList className="h-4 w-4" />}
          href="/orders"
        />
        <Metric
          title="Needs carrier coverage"
          value={tenders.notTendered.length}
          icon={<Truck className="h-4 w-4" />}
          href="/tenders"
        />
        <Metric
          title="Carrier offers awaiting reply"
          value={tenders.pending.length}
          icon={<Send className="h-4 w-4" />}
          href="/tenders"
        />
        <Metric
          title="Rated loads · expected margin"
          value={money(expectedMargin)}
          detail={`${ratedLoads.length} of ${loads.length} recent loads shown have both buy and sell rates`}
          icon={<DollarSign className="h-4 w-4" />}
          href="/billing"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PipelineColumn
          title="Needs carrier coverage"
          count={tenders.notTendered.length}
          empty="No open legs need a carrier right now."
          legs={tenders.notTendered.slice(0, 8)}
        />
        <PipelineColumn
          title="Offers awaiting carrier reply"
          count={tenders.pending.length}
          empty="No carrier offers are awaiting a reply."
          legs={tenders.pending.slice(0, 8)}
        />
        <PipelineColumn
          title="Booked / resolved"
          count={tenders.resolved.length}
          empty="Accepted or assigned legs will appear here."
          legs={tenders.resolved.slice(0, 8)}
        />
      </div>

      <section className="kpi-card p-4">
        <h2 className="text-sm font-semibold">Broker operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Customers, carrier contacts, offers and billing all use the current company-scoped
          records.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <QuickLink to="/customers" icon={<Building2 className="h-3.5 w-3.5" />}>
            Customers & shippers
          </QuickLink>
          <QuickLink to="/carriers" icon={<Truck className="h-3.5 w-3.5" />}>
            Carrier directory
          </QuickLink>
          <QuickLink to="/rates" icon={<Tags className="h-3.5 w-3.5" />}>
            Customer rates
          </QuickLink>
          <QuickLink to="/tenders" icon={<Send className="h-3.5 w-3.5" />}>
            Tender board
          </QuickLink>
          <QuickLink to="/billing" icon={<DollarSign className="h-3.5 w-3.5" />}>
            Invoices & settlements
          </QuickLink>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Expected margin is calculated as customer rate + fuel surcharge − carrier pay. It excludes
          accessorials and is not an accounting statement.
        </p>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  detail,
  icon,
  href,
}: {
  title: string;
  value: string | number;
  detail?: string;
  icon: React.ReactNode;
  href: "/orders" | "/tenders" | "/billing";
}) {
  return (
    <Link to={href} className="kpi-card block p-4 transition hover:border-primary/40">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}
    </Link>
  );
}

function PipelineColumn({
  title,
  count,
  empty,
  legs,
}: {
  title: string;
  count: number;
  empty: string;
  legs: ReturnType<typeof useTenderBoard>["notTendered"];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">
        {legs.map((leg) => {
          const latestTender = [...(leg.tenders ?? [])].sort(
            (a, b) => new Date(b.offered_at).getTime() - new Date(a.offered_at).getTime(),
          )[0];
          return (
            <Link
              key={leg.id}
              to="/tenders"
              className="block rounded-md border border-border bg-surface p-3 hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">
                  {leg.shipments?.shipment_number ?? "Shipment"}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {leg.origin?.location_name ?? "Origin TBD"} →{" "}
                {leg.destination?.location_name ?? "Destination TBD"}
              </div>
              {latestTender?.offered_rate != null && (
                <div className="mt-1 text-xs">
                  Offer: {money(Number(latestTender.offered_rate))}
                </div>
              )}
            </Link>
          );
        })}
        {legs.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function QuickLink({
  to,
  icon,
  children,
}: {
  to: "/customers" | "/carriers" | "/rates" | "/tenders" | "/billing";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
    >
      {icon}
      {children}
    </Link>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

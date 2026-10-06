import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { guard } from "@/lib/route-guard";

// tractor_id/broker_id aren't in the generated Database type yet — same
// escape hatch used elsewhere in this project for new columns.
const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know these columns yet
  from: (table: string) => any;
};

export const Route = createFileRoute("/_authenticated/bol/$loadId")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Bill of Lading — Me Do Logistics" }] }),
  component: BillOfLading,
});

/**
 * A clean, printable Bill of Lading built from the load's own data. This is
 * deliberately a print view, not a server-generated PDF file: turning it
 * into one needs nothing but the browser's own "Print > Save as PDF" (every
 * modern browser's print dialog offers that), so there's no new dependency
 * and no server-side rendering step to keep correct. A BOL received from
 * someone else as an actual PDF is uploaded instead, from the Documents
 * panel on the load's history page.
 */
function BillOfLading() {
  const { loadId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["bol", loadId],
    queryFn: async () => {
      const { data: load, error } = await sb
        .from("trailer_loads")
        .select(
          "id, schedule_id, pro_number, origin_name, origin_id, str_name, str_number, outbound_trailer, return_trailer, driver, comments, total_distance, created_at, client_id, carrier_id, broker_id, company_id",
        )
        .eq("id", loadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!load) return null;

      const [{ data: company }, { data: client }, { data: carrier }, { data: broker }] =
        await Promise.all([
          sb
            .from("companies")
            .select("name, mc_number, dot_number, dispatch_phone")
            .eq("id", load.company_id)
            .maybeSingle(),
          load.client_id
            ? sb
                .from("trailer_clients")
                .select("name, contact_info")
                .eq("id", load.client_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          load.carrier_id
            ? sb
                .from("carriers")
                .select("name, mc_number, dot_number, contact_phone")
                .eq("id", load.carrier_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          load.broker_id
            ? sb
                .from("brokers")
                .select("name, mc_number, contact_phone")
                .eq("id", load.broker_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

      return { load, company, client, carrier, broker };
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data?.load) return <div className="text-sm text-muted-foreground">Load not found.</div>;

  const { load, company, client, carrier, broker } = data;
  // The carrier actually hauling this load: the tendered-out carrier if one
  // was tendered, otherwise this company itself under its own authority —
  // never both, and never required to touch the carriers table at all.
  const haulingCarrier = carrier
    ? { name: carrier.name, mc: carrier.mc_number, dot: carrier.dot_number }
    : { name: company?.name ?? "—", mc: company?.mc_number, dot: company?.dot_number };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/history/$loadId"
          params={{ loadId }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to load
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
        </button>
      </div>

      <div className="kpi-card p-6 space-y-6 text-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="text-lg font-bold">Bill of Lading</div>
            <div className="text-xs text-muted-foreground">{company?.name}</div>
          </div>
          <div className="text-right text-xs">
            <div>
              Schedule <span className="font-mono font-semibold">{load.schedule_id}</span>
            </div>
            {load.pro_number && (
              <div>
                PRO <span className="font-mono">{load.pro_number}</span>
              </div>
            )}
            <div>{new Date(load.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">
              Shipper / Customer
            </div>
            <div className="font-medium">{client?.name ?? "—"}</div>
            {client?.contact_info && (
              <div className="text-xs text-muted-foreground">{client.contact_info}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Consignee</div>
            <div className="font-medium">{load.str_name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Store {load.str_number}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Origin</div>
            <div className="font-medium">{load.origin_name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{load.origin_id}</div>
          </div>
          {broker && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Broker</div>
              <div className="font-medium">{broker.name}</div>
              {broker.mc_number && (
                <div className="text-xs text-muted-foreground">MC {broker.mc_number}</div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Carrier</div>
          <div className="font-medium">{haulingCarrier.name}</div>
          <div className="text-xs text-muted-foreground">
            {haulingCarrier.mc && <>MC {haulingCarrier.mc} </>}
            {haulingCarrier.dot && <>DOT {haulingCarrier.dot}</>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Driver</div>
            <div>{load.driver ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Trailer</div>
            <div className="font-mono">{load.outbound_trailer ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Distance</div>
            <div>{load.total_distance ?? "—"}</div>
          </div>
        </div>

        {load.comments && (
          <div className="border-t border-border pt-4">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Notes</div>
            <div className="text-xs">{load.comments}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 border-t border-border pt-6 mt-4">
          <div>
            <div className="h-10 border-b border-border" />
            <div className="text-[10px] uppercase text-muted-foreground mt-1">
              Shipper signature / date
            </div>
          </div>
          <div>
            <div className="h-10 border-b border-border" />
            <div className="text-[10px] uppercase text-muted-foreground mt-1">
              Carrier signature / date
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

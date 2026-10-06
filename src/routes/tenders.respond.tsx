import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, CheckCircle2, XCircle, Loader2, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Zero-login carrier tender response. No session, no RLS-governed table
// access — every read and write here goes through a token-scoped RPC
// (get_tender_by_token / respond_to_tender_by_token) granted to anon and
// checked against an unguessable 32-byte token, the same "magic link"
// pattern as the shipper tracking page at /track/:token.
const sb = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type TenderOffer = {
  tender_id: string;
  status: "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "RESCINDED";
  offered_rate: number | null;
  offered_at: string;
  responded_at: string | null;
  expires_at: string | null;
  token_valid: boolean;
  carrier_name: string | null;
  schedule_id: string | null;
  origin_name: string | null;
  destination_name: string | null;
};

export const Route = createFileRoute("/tenders/respond")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" ? { token: search.token } : {},
  head: () => ({
    meta: [{ title: "Load offer — Me Do Logistics" }, { name: "robots", content: "noindex" }],
  }),
  component: TenderResponsePage,
});

function TenderResponsePage() {
  const { token } = Route.useSearch();
  const [offer, setOffer] = useState<TenderOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError("This link is missing its offer token.");
        setLoading(false);
        return;
      }
      const { data, error: err } = await sb.rpc("get_tender_by_token", { p_token: token });
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as TenderOffer | undefined;
        if (!row?.token_valid) {
          setError("This link is not valid or has expired. Contact dispatch for a new offer.");
        } else {
          setOffer(row);
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function respond(response: "ACCEPTED" | "REJECTED") {
    if (!token) return;
    setActing(response);
    try {
      const { data, error: err } = await sb.rpc("respond_to_tender_by_token", {
        p_token: token,
        p_response: response,
        p_response_notes: null,
      });
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok: boolean; message: string; status: string | null }
        | undefined;
      if (err || !row?.ok) {
        setError(err?.message ?? row?.message ?? "Could not record your response.");
        return;
      }
      setResolvedStatus(row.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record your response.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-lg p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Me Do Logistics</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading offer…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <PackageX className="h-8 w-8 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {!loading && !error && offer && (
          <>
            <div>
              <h1 className="text-lg font-semibold">Load offer — {offer.schedule_id ?? "—"}</h1>
              <p className="text-sm text-muted-foreground">
                {offer.origin_name ?? "Origin TBD"} → {offer.destination_name ?? "Destination TBD"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-1.5 text-sm">
              <Row label="Carrier" value={offer.carrier_name ?? "—"} />
              <Row
                label="Offered rate"
                value={
                  offer.offered_rate != null ? `$${offer.offered_rate.toFixed(2)}` : "Not specified"
                }
              />
              <Row label="Offered" value={new Date(offer.offered_at).toLocaleString()} />
              {offer.expires_at && (
                <Row label="Expires" value={new Date(offer.expires_at).toLocaleString()} />
              )}
            </div>

            {resolvedStatus ? (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
                  resolvedStatus === "ACCEPTED"
                    ? "bg-success/10 text-success"
                    : "bg-danger/10 text-danger"
                }`}
              >
                {resolvedStatus === "ACCEPTED" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {resolvedStatus === "ACCEPTED"
                  ? "You've accepted this load. Dispatch has been notified."
                  : "You've declined this load. Dispatch has been notified."}
              </div>
            ) : offer.status !== "OFFERED" ? (
              <p className="text-sm text-muted-foreground">
                This offer was already resolved ({offer.status.toLowerCase()}).
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => void respond("ACCEPTED")}
                  disabled={acting !== null}
                  className="flex-1 rounded-md bg-success py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {acting === "ACCEPTED" ? "Accepting…" : "Accept load"}
                </button>
                <button
                  onClick={() => void respond("REJECTED")}
                  disabled={acting !== null}
                  className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  {acting === "REJECTED" ? "Declining…" : "Decline"}
                </button>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground text-center">
              Accepting binds this rate as your carrier pay for this load. No account or sign-in is
              needed to respond.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { detectTransactionSet, bestEffortParse } from "@/lib/edi";

/**
 * Inbound EDI webhook (SPS Commerce, or any other trading partner).
 *
 *   POST /api/public/edi/sps
 *   Authorization: Bearer <EDI inbound token from Integrations>
 *
 * Accepts either a raw X12 body (the ISA/GS/ST envelope, as SPS's classic
 * Fulfillment/AS2 program delivers it) or a JSON body shaped
 * `{ transactionSet, payload }` for programs that deliver JSON instead.
 * Every document is stored as-received in edi_documents with status
 * NEEDS_REVIEW — nothing here auto-creates a tender or a load; see
 * src/lib/edi.ts for why an automated parse isn't trusted with that.
 */
export const Route = createFileRoute("/api/public/edi/sps")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // sync_secrets.edi_inbound_token and edi_documents aren't in the
        // generated Database type yet — same escape hatch used in
        // tracking.ts, scoped to just these calls.
        const admin = supabaseAdmin as unknown as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table yet
          from: (table: string) => any;
        };

        const { data: secretRow, error: secretErr } = await admin
          .from("sync_secrets")
          .select("company_id")
          .eq("edi_inbound_token", token)
          .maybeSingle();
        if (secretErr || !secretRow) return json({ error: "Invalid token" }, 401);
        const companyId = (secretRow as { company_id: string }).company_id;

        const rawBody = await request.text();
        if (!rawBody.trim()) return json({ error: "Empty body" }, 400);

        let transactionSet: string;
        let payloadForParsing = rawBody;
        let tradingPartner = "SPS_COMMERCE";
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            const asJson = JSON.parse(rawBody) as {
              transactionSet?: string;
              payload?: string;
              tradingPartner?: string;
            };
            transactionSet = asJson.transactionSet ?? "OTHER";
            payloadForParsing = asJson.payload ?? rawBody;
            tradingPartner = asJson.tradingPartner ?? tradingPartner;
          } catch (e) {
            return json(
              { error: "Invalid JSON", detail: e instanceof Error ? e.message : String(e) },
              400,
            );
          }
        } else {
          transactionSet = detectTransactionSet(
            rawBody,
            request.headers.get("x-edi-transaction-set"),
          );
        }

        const parsed = bestEffortParse(transactionSet, payloadForParsing);

        const { data, error } = await admin
          .from("edi_documents")
          .insert({
            company_id: companyId,
            direction: "IN",
            transaction_set: transactionSet,
            trading_partner: tradingPartner,
            raw_payload: rawBody,
            parsed,
            status: "NEEDS_REVIEW",
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);

        return json(
          { received: true, documentId: (data as { id: string }).id, transactionSet },
          200,
        );
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

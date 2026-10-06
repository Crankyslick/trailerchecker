import { useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// edi_documents and the edi_* RPCs aren't in the generated Database type
// yet — same escape hatch used elsewhere in this project for new tables.
const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

// ---------------------------------------------------------------------------
// Inbound webhook token (separate from the telematics tracking token).
// ---------------------------------------------------------------------------

export function useEdiInboundToken() {
  return useQuery({
    queryKey: ["sync_secrets", "edi_inbound_token"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.rpc("get_edi_inbound_token");
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },
  });
}

export async function rotateEdiInboundToken(): Promise<string> {
  const { data, error } = await sb.rpc("rotate_edi_inbound_token");
  if (error) throw new Error(error.message);
  return data as string;
}

// ---------------------------------------------------------------------------
// Documents — inbound tenders/invoices received, and outbound responses
// queued against them.
// ---------------------------------------------------------------------------

export type EdiDirection = "IN" | "OUT";
export type EdiStatus =
  | "NEEDS_REVIEW"
  | "REVIEWED"
  | "IGNORED"
  | "PROMOTED"
  | "QUEUED"
  | "SENT"
  | "FAILED";

export type EdiDocument = {
  id: string;
  direction: EdiDirection;
  transaction_set: string;
  trading_partner: string;
  raw_payload: string | null;
  parsed: Record<string, unknown> | null;
  status: EdiStatus;
  related_load_id: string | null;
  in_reply_to: string | null;
  note: string | null;
  created_at: string;
};

const EDI_COLUMNS =
  "id, direction, transaction_set, trading_partner, raw_payload, parsed, status, related_load_id, in_reply_to, note, created_at";

export function useEdiDocuments() {
  const query = useQuery({
    queryKey: ["edi_documents"],
    queryFn: async (): Promise<EdiDocument[]> => {
      const { data, error } = await sb
        .from("edi_documents")
        .select(EDI_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as EdiDocument[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | undefined;
    try {
      ch = supabase
        .channel(`edi-documents-stream-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "edi_documents" },
          () => void query.refetch(),
        )
        .subscribe();
    } catch {
      /* noop */
    }
    return () => {
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

/** Marks an inbound document reviewed/ignored/promoted, optionally linking
 * the load it was manually turned into. */
export async function reviewEdiDocument(input: {
  documentId: string;
  status: "REVIEWED" | "IGNORED" | "PROMOTED";
  relatedLoadId?: string | null;
  note?: string | null;
}) {
  const { error } = await sb.rpc("review_edi_document", {
    p_document_id: input.documentId,
    p_status: input.status,
    p_related_load_id: input.relatedLoadId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Queues a response (e.g. a 990) against an inbound document. This
 * records the response durably; it does NOT transmit it to SPS — this
 * account's outbound transport/credentials aren't configured yet, so the
 * row stays QUEUED rather than being marked SENT without being sent. */
export async function queueEdiResponse(input: {
  inReplyTo: string;
  transactionSet: string;
  parsed?: Record<string, unknown> | null;
  note?: string | null;
}) {
  const { error } = await sb.rpc("queue_edi_response", {
    p_in_reply_to: input.inReplyTo,
    p_transaction_set: input.transactionSet,
    p_parsed: input.parsed ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}

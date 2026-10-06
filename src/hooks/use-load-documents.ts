import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// load_documents isn't in the generated Database type yet — same escape
// hatch used elsewhere in this project for new tables.
const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table yet
  from: (table: string) => any;
};

export const DOCUMENT_TYPES = [
  "BOL",
  "RATE_CONFIRMATION",
  "POD",
  "LUMPER_RECEIPT",
  "SCALE_TICKET",
  "INSPECTION",
  "INVOICE",
  "OTHER",
] as const;
export type LoadDocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<LoadDocumentType, string> = {
  BOL: "Bill of lading",
  RATE_CONFIRMATION: "Rate confirmation",
  POD: "Proof of delivery",
  LUMPER_RECEIPT: "Lumper receipt",
  SCALE_TICKET: "Scale ticket",
  INSPECTION: "Inspection record",
  INVOICE: "Invoice",
  OTHER: "Other",
};

export type LoadDocument = {
  id: string;
  load_id: string;
  document_type: LoadDocumentType;
  file_name: string | null;
  storage_path: string | null;
  note: string | null;
  created_at: string;
};

export function useLoadDocuments(loadId: string | null) {
  return useQuery({
    queryKey: ["load_documents", loadId],
    enabled: Boolean(loadId),
    queryFn: async (): Promise<LoadDocument[]> => {
      const { data, error } = await sb
        .from("load_documents")
        .select("id, load_id, document_type, file_name, storage_path, note, created_at")
        .eq("load_id", loadId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as LoadDocument[];
    },
    placeholderData: keepPreviousData,
  });
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "document";
}

/** Uploads a file (any type — PDF, image, etc.) to the private
 * load-documents bucket and records the matching row. A note alone, with
 * no file, is also a valid document (e.g. "BOL received by email, filed
 * under PO #1234"). */
export async function uploadLoadDocument(input: {
  loadId: string;
  companyId: string;
  documentType: LoadDocumentType;
  file: File | null;
  note?: string | null;
}): Promise<void> {
  let storagePath: string | null = null;
  let fileName: string | null = null;
  if (input.file) {
    fileName = input.file.name;
    storagePath = `${input.companyId}/${input.loadId}/${Date.now()}-${safeFileName(input.file.name)}`;
    const { error: upErr } = await supabase.storage
      .from("load-documents")
      .upload(storagePath, input.file, { upsert: false, contentType: input.file.type });
    if (upErr) throw new Error(upErr.message);
  }
  if (!storagePath && !input.note?.trim()) {
    throw new Error("Attach a file or add a note.");
  }
  const { error } = await sb.from("load_documents").insert({
    load_id: input.loadId,
    company_id: input.companyId,
    document_type: input.documentType,
    file_name: fileName,
    storage_path: storagePath,
    note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Short-lived link so staff can open or download a private document. */
export async function loadDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("load-documents")
    .createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteLoadDocument(input: {
  id: string;
  storagePath: string | null;
}): Promise<void> {
  const { error } = await sb.from("load_documents").delete().eq("id", input.id);
  if (error) throw new Error(error.message);
  if (input.storagePath) {
    // Best-effort: the row is already gone either way, so a storage error
    // here is logged, not thrown.
    const { error: storageErr } = await supabase.storage
      .from("load-documents")
      .remove([input.storagePath]);
    if (storageErr) console.error("[load-documents] could not remove file", storageErr);
  }
}

export function useInvalidateLoadDocuments() {
  const qc = useQueryClient();
  return (loadId: string) => void qc.invalidateQueries({ queryKey: ["load_documents", loadId] });
}

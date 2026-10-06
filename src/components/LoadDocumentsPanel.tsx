import { useState } from "react";
import { toast } from "sonner";
import { Upload, Paperclip, Trash2 } from "lucide-react";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type LoadDocumentType,
  useLoadDocuments,
  useInvalidateLoadDocuments,
  uploadLoadDocument,
  loadDocumentUrl,
  deleteLoadDocument,
} from "@/hooks/use-load-documents";

const field =
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * Drop this into any load-detail surface — load history, dispatch board
 * detail, driver mobile — to attach a BOL, a rate confirmation, a POD, a
 * lumper receipt, or any other document (PDF or photo) to that load, and to
 * see what's already attached. The upload itself needs no PDF-specific
 * code: any file type is stored as-is in the private load-documents bucket.
 */
export function LoadDocumentsPanel({
  loadId,
  companyId,
  canManage = true,
}: {
  loadId: string;
  companyId: string;
  canManage?: boolean;
}) {
  const { data: documents } = useLoadDocuments(loadId);
  const invalidate = useInvalidateLoadDocuments();
  const [documentType, setDocumentType] = useState<LoadDocumentType>("BOL");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    setBusy(true);
    try {
      await uploadLoadDocument({ loadId, companyId, documentType, file, note });
      setNote("");
      setFile(null);
      invalidate(loadId);
      toast.success("Document added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the document");
    } finally {
      setBusy(false);
    }
  }

  async function open(storagePath: string) {
    try {
      const url = await loadDocumentUrl(storagePath);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  async function remove(id: string, storagePath: string | null) {
    try {
      await deleteLoadDocument({ id, storagePath });
      invalidate(loadId);
      toast.success("Document removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the document");
    }
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="text-sm font-medium">Documents</div>

      {canManage && (
        <div className="flex flex-col md:flex-row gap-2">
          <select
            className={`${field} md:w-48`}
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as LoadDocumentType)}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            className={field}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-muted-foreground"
          />
          <button
            onClick={upload}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-surface border border-border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Upload className="h-3 w-3" /> {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      <div className="space-y-1">
        {(documents ?? []).length === 0 && (
          <div className="text-xs text-muted-foreground">No documents attached yet.</div>
        )}
        {(documents ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between text-xs gap-2">
            <span className="truncate">
              <span className="text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.document_type]}</span>{" "}
              {d.file_name ?? d.note ?? ""}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {d.storage_path && (
                <button
                  onClick={() => open(d.storage_path!)}
                  className="inline-flex items-center gap-1 text-primary"
                >
                  <Paperclip className="h-3 w-3" /> Open
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => remove(d.id, d.storage_path)}
                  className="inline-flex items-center gap-1 text-destructive"
                  aria-label="Remove document"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

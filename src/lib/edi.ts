/**
 * Minimal, best-effort X12 EDI helpers for the inbound SPS webhook.
 *
 * This deliberately does NOT claim to be a real X12 parser. A correct one
 * needs the trading partner's actual implementation guide (which segments
 * are used, in what order, with which qualifiers) — guessing that from the
 * generic 204/990/210 segment layouts risks silently misreading a real
 * tender. What this gives staff instead: the transaction-set code (reliable
 * — it's a fixed position in the ST segment) and a handful of commonly
 * present fields, extracted only when unambiguous, always alongside the
 * untouched raw payload so a human can check the parse before acting on it.
 */

export type EdiEnvelope = {
  transactionSet: string;
  parsed: Record<string, unknown> | null;
};

/** Segment terminator varies by sender; '~' is by far the most common. */
function splitSegments(raw: string): string[] {
  return raw
    .split(/[~\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Detects the transaction set from an ST segment (`ST*204*0001~` → "204"),
 * or from a `?type=` query param / JSON `{ transactionSet }` for senders
 * that deliver JSON instead of raw X12 (SPS's newer API products do this).
 */
export function detectTransactionSet(raw: string, hint: string | null): string {
  const st = splitSegments(raw).find((s) => s.startsWith("ST*") || s.startsWith("ST~"));
  if (st) {
    const code = st.split("*")[1]?.trim();
    if (code) return code;
  }
  if (hint?.trim()) return hint.trim();
  try {
    const asJson = JSON.parse(raw) as { transactionSet?: string };
    if (asJson.transactionSet) return String(asJson.transactionSet);
  } catch {
    /* not JSON, and that's fine — raw X12 is the expected shape */
  }
  return "OTHER";
}

/**
 * Best-effort extraction of a few fields out of a 204 (load tender) body,
 * for display only — never written into a load/tender automatically. Pulls
 * from the B2 (set purpose/shipment ID), L11 (reference numbers), and G62
 * (date/time) segments when present and unambiguous; leaves a field out
 * entirely rather than guessing at a qualifier this account's partner spec
 * might use differently.
 */
export function bestEffortParse204(raw: string): Record<string, unknown> | null {
  const segments = splitSegments(raw);
  if (segments.length === 0) return null;

  const out: Record<string, unknown> = {};
  for (const seg of segments) {
    const fields = seg.split("*");
    const tag = fields[0];
    if (tag === "B2" && fields[4]) out["shipmentId"] = fields[4];
    if (tag === "L11" && fields[1] && fields[2]) out[`reference_${fields[2]}`] = fields[1];
    if (tag === "G62" && fields[1] === "64" && fields[2]) out["pickupDate"] = fields[2];
    if (tag === "G62" && fields[1] === "68" && fields[2]) out["deliveryDate"] = fields[2];
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function bestEffortParse(
  transactionSet: string,
  raw: string,
): Record<string, unknown> | null {
  if (transactionSet === "204") return bestEffortParse204(raw);
  return null;
}

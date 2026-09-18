/**
 * Round Trip Sweep / Backhaul detection.
 *
 * Dispatch exports describe sweeps inconsistently ("Roundtrip Sweep",
 * "RT Sweep", "Sweep", "Backhaul", "Back haul"), and the term can land in the
 * load type, category, unload type or the carrier comments. One shared rule
 * keeps the app, the webhook payload and column R of the Daily dispatch sheet
 * in agreement.
 */

const SWEEP_PATTERN =
  /\b(round\s*-?\s*trip\s+sweep|rt\s+sweep|roundtrip\s+sweep|sweep|back\s*-?\s*haul)\b/i;

/** True when any supplied field mentions a sweep or backhaul. */
export function isRoundTripSweep(...fields: Array<string | null | undefined>): boolean {
  return fields.some((f) => !!f && SWEEP_PATTERN.test(String(f)));
}

/** Sheet cell value for column R (Round Trip Sweep). */
export function sweepCell(flag: boolean): "TRUE" | "FALSE" {
  return flag ? "TRUE" : "FALSE";
}

// Wall-clock date extraction in the operational timezone (America/New_York).
// A late-night departure like "7/30/2026 10:27 PM" must stay on 7/30 — never
// roll forward to 7/31 via UTC conversion.
export const ET_TZ = "America/New_York";

export function toEstIsoDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const raw = s.trim();
  if (!raw) return null;

  // 1) Explicit wall-clock strings without a timezone offset: take the date as-is.
  // A tz offset only counts when the string also contains a time portion —
  // otherwise the "-2026" in "7-30-2026" looks like an offset.
  const hasOffset = /[zZ]/.test(raw) || (/:/.test(raw) && /[+-]\d{2}:?\d{2}$/.test(raw));
  const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (mdy && !hasOffset) {
    const [, mo, da, yr] = mdy;
    const y = yr.length === 2 ? `20${yr}` : yr;
    return `${y}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd && !hasOffset) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // 2) Anything else (ISO w/ offset, "Nov 12, 2025 08:30"): convert into ET.
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Schedule date always comes from the DEPARTURE timestamp, never delivery/arrival.
 * Accepts the candidate fields in priority order (Expected Pickup, Departure, Cutoff Time).
 */
export function departureDateFromCandidates(
  ...candidates: (string | undefined | null)[]
): string | null {
  for (const c of candidates) {
    const d = toEstIsoDate(c);
    if (d) return d;
  }
  return null;
}

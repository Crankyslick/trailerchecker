// Client-safe catalogue of revenue codes mapped into QuickBooks.
export type RevenueItem = { code: string; label: string; defaultItem: string };

export const REVENUE_ITEMS: RevenueItem[] = [
  { code: "LINEHAUL", label: "Base freight / linehaul", defaultItem: "Freight — Linehaul" },
  { code: "FUEL", label: "Fuel surcharge", defaultItem: "Freight — Fuel Surcharge" },
  { code: "DETENTION", label: "Detention", defaultItem: "Freight — Detention" },
  { code: "DEMURRAGE", label: "Demurrage", defaultItem: "Freight — Demurrage" },
  { code: "PERDIEM", label: "Per diem", defaultItem: "Freight — Per Diem" },
  { code: "CHXSPLIT", label: "Chassis split", defaultItem: "Freight — Chassis Split" },
  { code: "STORAGE", label: "Storage", defaultItem: "Freight — Storage" },
  { code: "DRYRUN", label: "Dry run", defaultItem: "Freight — Dry Run" },
  { code: "TWAIT", label: "Terminal wait time", defaultItem: "Freight — Terminal Wait" },
  { code: "LAYOVER", label: "Layover", defaultItem: "Freight — Layover" },
  { code: "STOPOFF", label: "Extra stop", defaultItem: "Freight — Extra Stop" },
];

export function itemNameFor(code: string) {
  return REVENUE_ITEMS.find((r) => r.code === code)?.defaultItem ?? `Freight — ${code}`;
}

/**
 * Invoice lines are generated as either "Linehaul + fuel — SCHEDULE" or
 * "CODE: description" (accessorials). Recover the revenue code from that text
 * so each line lands on the right QuickBooks item.
 */
export function codeForDescription(description: string): string {
  const m = /^([A-Z0-9_]{2,20})\s*:/.exec(description.trim());
  if (m?.[1]) {
    const code = m[1];
    return REVENUE_ITEMS.some((r) => r.code === code) ? code : code;
  }
  return "LINEHAUL";
}

export type QboSyncStatus = "not_synced" | "syncing" | "synced" | "error";

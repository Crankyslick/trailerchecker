import type { Database } from "@/integrations/supabase/types";

export type ProductKey = Database["public"]["Enums"]["product_key"];

export type ProductDef = {
  key: ProductKey;
  name: string;
  tagline: string;
  blurb: string;
  price: string;
  priceUnit: string;
  features: string[];
  /** Routes unlocked by this product. */
  routes: string[];
};

export const PRODUCTS: ProductDef[] = [
  {
    key: "trailer",
    name: "Trailer & Yard",
    tagline: "Dispatch board, gate kiosk and live yard aging",
    blurb:
      "Track outbound and return trailers separately, auto-stamp yard arrivals, and escalate anything sitting past 24 hours.",
    price: "$40",
    priceUnit: "per user / month",
    features: [
      "Live dispatch board grouped by schedule date",
      "Outbound and return trailers tracked separately",
      "Gate kiosk with auto-stamped arrival times",
      "24 / 48 hour yard aging alerts",
      "Google Sheet two-way sync",
      "Driver board and full trailer history",
    ],
    routes: ["/dashboard", "/tomorrow", "/kiosk", "/history", "/drivers"],
  },
  {
    key: "drayage",
    name: "Drayage",
    tagline: "Container moves, chassis and port turn times",
    blurb:
      "Run port and rail container moves end to end: last free day countdowns, chassis assignment, appointments and per-move rates.",
    price: "$55",
    priceUnit: "per user / month",
    features: [
      "Container board with live status workflow",
      "Last free day countdown and demurrage risk",
      "Chassis and driver assignment",
      "Terminal appointments and ETAs",
      "Per-move rating and invoiced flag",
      "Immutable container event history",
    ],
    routes: ["/containers"],
  },
];

export function productByKey(key: ProductKey): ProductDef {
  return PRODUCTS.find((p) => p.key === key) ?? PRODUCTS[0];
}

/**
 * Whether a tenant_products row currently grants access. Mirrors
 * public.tenant_has_product() in the database (the authoritative check via
 * RLS) — kept in sync deliberately: a cancelled subscription or an expired
 * trial should stop being usable in the UI at the same moment RLS starts
 * rejecting writes for it, not before and not after.
 */
export function isProductEntitled(row: { status: string; trial_ends_at: string | null }): boolean {
  if (row.status === "cancelled") return false;
  if (row.status === "trial") {
    return row.trial_ends_at == null || new Date(row.trial_ends_at).getTime() > Date.now();
  }
  return true; // "active" or any other non-trial, non-cancelled status
}

export function parseProductParam(value: unknown): ProductKey[] {
  const raw = typeof value === "string" ? value : "";
  const keys = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is ProductKey => v === "trailer" || v === "drayage");
  return keys.length ? Array.from(new Set(keys)) : ["trailer"];
}

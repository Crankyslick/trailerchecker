/**
 * What each organization and person sees.
 *
 * One table decides both the sidebar and the route guards, so a screen is
 * never listed for someone who would be bounced off it (or the reverse).
 * Three things narrow it, in this order:
 *   1. product   — the organization's subscriptions (Trailer & Yard, Drayage)
 *   2. model     — the operating profile chosen in setup/Settings
 *                  (asset carrier, freight broker, or both)
 *   3. roles     — the person's role (owner/admin, dispatcher, billing,
 *                  gate guard, driver)
 * Row-level security in the database stays the authoritative control.
 */
import type { AppRole } from "@/lib/access";
import type { BusinessModel } from "@/lib/brokerage";
import type { ProductKey } from "@/lib/products";

export type Screen = {
  path: string;
  label: string;
  /** Any one of these products unlocks it. Omitted: no product needed. */
  products?: ProductKey[];
  /** Operating profiles it belongs to. Omitted: every profile. */
  models?: BusinessModel[];
  /** Any one of these roles may open it (owners pass every admin check). */
  roles: AppRole[];
  /** Hidden from the sidebar (detail pages, printouts) but still guarded. */
  hidden?: boolean;
};

const ADMIN: AppRole[] = ["owner", "admin"];
const OPS: AppRole[] = ["owner", "admin", "dispatcher"];
const MONEY: AppRole[] = ["owner", "admin", "dispatcher", "billing"];
const ASSET: BusinessModel[] = ["ASSET_BASED_3PL", "HYBRID"];
const BROKER: BusinessModel[] = ["FREIGHT_BROKER", "HYBRID"];
const TRAILER: ProductKey[] = ["trailer"];

/** Sidebar order. */
export const SCREENS: Screen[] = [
  // Own fleet & yard (asset-based carriers)
  { path: "/dashboard", label: "Control Tower", products: TRAILER, models: ASSET, roles: OPS },
  { path: "/tomorrow", label: "Tomorrow Board", products: TRAILER, models: ASSET, roles: OPS },
  { path: "/yard", label: "Yard", products: TRAILER, models: ASSET, roles: OPS, hidden: true },
  {
    path: "/kiosk",
    label: "Gate Kiosk",
    products: TRAILER,
    models: ASSET,
    roles: [...OPS, "guard"],
  },
  { path: "/driver", label: "My Loads", products: TRAILER, models: ASSET, roles: ["driver"] },

  // Brokerage
  { path: "/broker", label: "Broker Desk", products: TRAILER, models: BROKER, roles: OPS },

  // Freight every profile runs
  { path: "/orders", label: "Orders", products: TRAILER, roles: OPS },
  { path: "/shipments", label: "Shipments", products: TRAILER, roles: OPS },
  { path: "/planning", label: "Load Planning", products: TRAILER, roles: OPS },
  { path: "/carriers", label: "Carriers", products: TRAILER, roles: OPS },
  { path: "/tenders", label: "Tenders", products: TRAILER, roles: OPS },
  { path: "/exceptions", label: "Exceptions", products: TRAILER, roles: OPS },

  // Drayage
  { path: "/containers", label: "Container Board", products: ["drayage"], roles: OPS },

  // Own fleet records
  { path: "/fleet", label: "Tractors & Brokers", products: TRAILER, models: ASSET, roles: OPS },
  {
    path: "/drivers",
    label: "Drivers",
    products: ["trailer", "drayage"],
    models: ASSET,
    roles: OPS,
  },

  // Money
  { path: "/customers", label: "Customers", products: TRAILER, roles: MONEY },
  { path: "/rates", label: "Rates", products: TRAILER, roles: MONEY },
  { path: "/billing", label: "Billing", products: TRAILER, roles: MONEY },
  {
    path: "/reconciliation",
    label: "Reconciliation",
    products: TRAILER,
    models: ASSET,
    roles: OPS,
  },

  // Records
  { path: "/history", label: "History", products: TRAILER, models: ASSET, roles: OPS },
  { path: "/reports", label: "Reports", products: TRAILER, roles: OPS, hidden: true },
  { path: "/search", label: "Search", products: TRAILER, roles: OPS, hidden: true },
  { path: "/loads", label: "Loads", products: TRAILER, roles: OPS, hidden: true },
  { path: "/stores", label: "Stores", products: TRAILER, models: ASSET, roles: OPS, hidden: true },
  {
    path: "/bol",
    label: "Bill of lading",
    products: TRAILER,
    roles: [...OPS, "driver"],
    hidden: true,
  },

  // Administration
  { path: "/integrations", label: "Integrations", roles: ADMIN },
  { path: "/users", label: "Users", roles: ADMIN },
  { path: "/settings", label: "Settings", roles: ADMIN },
];

export type Workspace = {
  roles: AppRole[];
  products: ProductKey[];
  model: BusinessModel;
};

function roleOk(roles: AppRole[], allowed: AppRole[]): boolean {
  const effective = allowed.includes("admin") ? [...allowed, "owner" as AppRole] : allowed;
  return roles.some((r) => effective.includes(r));
}

export function canSee(ws: Workspace, screen: Screen): boolean {
  if (screen.products && !screen.products.some((p) => ws.products.includes(p))) return false;
  if (screen.models && !screen.models.includes(ws.model)) return false;
  return roleOk(ws.roles, screen.roles);
}

/** The screen a path belongs to (detail pages map to their parent). */
export function screenFor(pathname: string): Screen | undefined {
  return SCREENS.filter((s) => pathname === s.path || pathname.startsWith(`${s.path}/`)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
}

export function sidebarScreens(ws: Workspace): Screen[] {
  return SCREENS.filter((s) => !s.hidden && canSee(ws, s));
}

/** Where someone lands after sign-in, and where they're sent from a screen they can't use. */
export function homePath(ws: Workspace): string {
  const preference = [
    ws.model === "FREIGHT_BROKER" ? "/broker" : "/dashboard",
    "/containers",
    "/driver",
    "/kiosk",
    "/billing",
    "/broker",
    "/orders",
    "/settings",
  ];
  for (const path of preference) {
    const s = SCREENS.find((x) => x.path === path);
    if (s && canSee(ws, s)) return path;
  }
  return sidebarScreens(ws)[0]?.path ?? "/no-access";
}

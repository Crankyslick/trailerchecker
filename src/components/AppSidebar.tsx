import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarClock,
  History,
  Users,
  UserCog,
  Settings,
  Truck,
  Smartphone,
  Container,
  ClipboardList,
  Boxes,
  Route as RouteIcon,
  Building2,
  AlertTriangle,
  UserRound,
  Radar,
  Plug,
  DollarSign,
  Tags,
  Send,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-auth";
import { useTenantProducts } from "@/hooks/use-products";
import type { ProductKey } from "@/lib/products";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: readonly string[];
  product?: ProductKey;
};

const items: readonly Item[] = [
  {
    to: "/dashboard",
    label: "Control Tower",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/orders",
    label: "Orders",
    icon: ClipboardList,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/shipments",
    label: "Shipments",
    icon: Boxes,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/planning",
    label: "Load Planning",
    icon: RouteIcon,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/carriers",
    label: "Carriers",
    icon: Building2,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/tenders",
    label: "Tenders",
    icon: Send,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/billing",
    label: "Billing",
    icon: DollarSign,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/rates",
    label: "Rates",
    icon: Tags,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/exceptions",
    label: "Exceptions",
    icon: AlertTriangle,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/reconciliation",
    label: "Reconciliation",
    icon: Radar,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/integrations",
    label: "Integrations",
    icon: Plug,
    roles: ["owner", "admin"],
    product: "trailer",
  },
  {
    to: "/driver",
    label: "My Loads",
    icon: UserRound,
    roles: ["driver"],
    product: "trailer",
  },
  {
    to: "/tomorrow",
    label: "Tomorrow Board",
    icon: CalendarClock,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/kiosk",
    label: "Gate Kiosk",
    icon: Smartphone,
    roles: ["owner", "admin", "dispatcher", "guard"],
    product: "trailer",
  },
  {
    to: "/history",
    label: "History",
    icon: History,
    roles: ["owner", "admin", "dispatcher"],
    product: "trailer",
  },
  {
    to: "/containers",
    label: "Container Board",
    icon: Container,
    roles: ["owner", "admin", "dispatcher"],
    product: "drayage",
  },
  { to: "/drivers", label: "Drivers", icon: Users, roles: ["owner", "admin", "dispatcher"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["owner", "admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["owner", "admin"] },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { roles, org } = useCurrentUser();
  const { has, loading } = useTenantProducts();

  const visible = items.filter((it) => {
    const roleOk = roles.length === 0 || it.roles.some((r) => roles.includes(r as never));
    const productOk = !it.product || loading || has(it.product);
    return roleOk && productOk;
  });

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border">
        <div className="h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold tracking-tight">Me Do Logistics</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {org?.name ?? "Operations"}
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visible.map((it) => {
          const active = pathname === it.to || pathname.startsWith(`${it.to}/`);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60 border border-transparent"
              }`}
            >
              <it.icon className="h-4 w-4 shrink-0" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-border text-[10px] text-muted-foreground">
        v1.0 · Me Do Logistics
      </div>
    </aside>
  );
}

import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
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
  Briefcase,
  Handshake,
  Circle,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-auth";
import { sidebarScreens } from "@/lib/workspace";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/tomorrow": CalendarClock,
  "/kiosk": Smartphone,
  "/driver": UserRound,
  "/broker": Handshake,
  "/orders": ClipboardList,
  "/shipments": Boxes,
  "/planning": RouteIcon,
  "/carriers": Building2,
  "/tenders": Send,
  "/exceptions": AlertTriangle,
  "/containers": Container,
  "/fleet": Truck,
  "/drivers": Users,
  "/customers": Briefcase,
  "/rates": Tags,
  "/billing": DollarSign,
  "/reconciliation": Radar,
  "/history": History,
  "/integrations": Plug,
  "/users": UserCog,
  "/settings": Settings,
};

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { org } = useCurrentUser();
  // Same workspace table and access snapshot the route guards use, so the
  // menu never lists a screen that would bounce this person away.
  const { access } = useRouteContext({ from: "/_authenticated" });
  const visible = sidebarScreens(access);

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
          const Icon = ICONS[it.path] ?? Circle;
          const active = pathname === it.path || pathname.startsWith(`${it.path}/`);
          return (
            <Link
              key={it.path}
              to={it.path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60 border border-transparent"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
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

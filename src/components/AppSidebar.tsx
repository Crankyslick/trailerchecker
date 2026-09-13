import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, History, Users, UserCog, Settings, Truck, Smartphone } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-auth";

const items = [
  { to: "/dashboard", label: "Control Tower", icon: LayoutDashboard, roles: ["admin", "dispatcher"] },
  { to: "/tomorrow", label: "Tomorrow Board", icon: CalendarClock, roles: ["admin", "dispatcher"] },
  { to: "/kiosk", label: "Gate Kiosk", icon: Smartphone, roles: ["admin", "dispatcher", "guard"] },
  { to: "/history", label: "History", icon: History, roles: ["admin", "dispatcher"] },
  { to: "/drivers", label: "Drivers", icon: Users, roles: ["admin", "dispatcher"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { roles, org } = useCurrentUser();
  const visible = items.filter((it) => roles.length === 0 || it.roles.some((r) => roles.includes(r as never)));

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border">
        <div className="h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold tracking-tight">Me Do Logistics</div>
          <div className="truncate text-[10px] text-muted-foreground">{org?.name ?? "Yard 589 · Compliance"}</div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visible.map((it) => {
          const active = pathname === it.to || pathname.startsWith(`${it.to}/`);
          return (
            <Link key={it.to} to={it.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60 border border-transparent"
              }`}>
              <it.icon className="h-4 w-4 shrink-0" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-border text-[10px] text-muted-foreground">
        v1.0 · Ahmed Beshir
      </div>
    </aside>
  );
}

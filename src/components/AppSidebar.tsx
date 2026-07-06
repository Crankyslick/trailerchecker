import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, History, Users, UserCog, Settings, Truck } from "lucide-react";

const items = [
  { to: "/", label: "Control Tower", icon: LayoutDashboard },
  { to: "/tomorrow", label: "Tomorrow Board", icon: CalendarClock },
  { to: "/history", label: "History", icon: History },
  { to: "/drivers", label: "Drivers", icon: Users },
  { to: "/users", label: "Users", icon: UserCog },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border">
        <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Truck className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">Trailer Checker</div>
          <div className="text-[10px] text-muted-foreground">Yard 589 · Compliance</div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          return (
            <Link key={it.to} to={it.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60 border border-transparent"
              }`}>
              <it.icon className="h-4 w-4" />
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

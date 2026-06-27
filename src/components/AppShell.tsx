import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Truck, Warehouse, Store, Users, Search,
  BarChart3, History, Truck as TruckIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/loads", label: "Live Load Board", icon: Truck },
  { to: "/yard", label: "Yard Inventory", icon: Warehouse },
  { to: "/stores", label: "Store Board", icon: Store },
  { to: "/drivers", label: "Drivers", icon: Users },
  { to: "/search", label: "Trailer Search", icon: Search },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/history", label: "Trailer History", icon: History },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-black">
            <TruckIcon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">VTCD Dispatch</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Chambersburg DC
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2 border border-transparent"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-[10px] uppercase tracking-widest text-muted-foreground">
          TMS · v1.0
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <TruckIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Target Trailer Operations</div>
              <div className="text-[11px] text-muted-foreground">Real-time dispatch board</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 chip">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Live
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</main>
        <nav className="md:hidden border-t border-border bg-surface flex overflow-x-auto">
          {NAV.slice(0, 6).map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex-1 min-w-[72px] flex flex-col items-center gap-1 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}>
                <item.icon className="h-4 w-4" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

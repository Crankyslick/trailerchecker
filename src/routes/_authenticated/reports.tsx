import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { useLoads } from "@/hooks/use-loads";
import { yardHours, yardTier } from "@/lib/loads";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — VTCD Dispatch" }] }),
  component: Reports,
});

const COLORS = ["oklch(0.72 0.18 150)", "oklch(0.82 0.17 85)", "oklch(0.65 0.22 25)"];

function Reports() {
  const { data: loads = [] } = useLoads();

  const byStore = useMemo(() => {
    const m = new Map<string, number>();
    loads.forEach((l) => {
      if (!l.str_number) return;
      m.set(l.str_number, (m.get(l.str_number) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([store, count]) => ({ store, count }));
  }, [loads]);

  const completedByDay = useMemo(() => {
    const m = new Map<string, number>();
    loads.filter((l) => l.status === "Completed").forEach((l) => {
      const d = l.schedule_date ?? "";
      m.set(d, (m.get(d) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort().map(([day, count]) => ({ day, count }));
  }, [loads]);

  const yardTiers = useMemo(() => {
    const yard = loads.filter((l) => l.return_trailer_location === "Yard");
    const buckets = { green: 0, yellow: 0, red: 0 };
    yard.forEach((l) => {
      const t = yardTier(yardHours(l.yard_arrival_at));
      if (t === "green") buckets.green++;
      else if (t === "yellow") buckets.yellow++;
      else if (t === "red") buckets.red++;
    });
    return [
      { name: "< 24h", value: buckets.green },
      { name: "24–48h", value: buckets.yellow },
      { name: "48h+", value: buckets.red },
    ];
  }, [loads]);

  const driverWorkload = useMemo(() => {
    const m = new Map<string, number>();
    loads.forEach((l) => {
      if (!l.driver) return;
      m.set(l.driver, (m.get(l.driver) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([driver, count]) => ({ driver, count }))
      .sort((a, b) => b.count - a.count);
  }, [loads]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Performance signals across stores, drivers and yard aging.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Loads per Store">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byStore}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="store" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="oklch(0.82 0.15 200)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Loads Completed by Day">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={completedByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="oklch(0.72 0.18 150)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Yard Trailer Aging">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={yardTiers} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                {yardTiers.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Driver Workload">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={driverWorkload} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis dataKey="driver" type="category" stroke="var(--muted-foreground)" fontSize={11} width={100} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="oklch(0.72 0.15 290)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="kpi-card p-4">
      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

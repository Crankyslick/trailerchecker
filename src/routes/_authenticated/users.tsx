import { createFileRoute } from "@tanstack/react-router";
import { UserCog, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — Trailer Checker" }] }),
  component: UsersPage,
});

const mock = [
  { name: "Ahmed Beshir", role: "Dispatch Lead", email: "ahmed@vitaltransport.co", status: "Owner" },
  { name: "Yard Operator", role: "Gate Ops", email: "gate@vitaltransport.co", status: "Active" },
  { name: "Compliance Auditor", role: "Read-only", email: "audit@vitaltransport.co", status: "Active" },
];

function UsersPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCog className="h-6 w-6 text-primary" /> Users</h1>
        <p className="text-sm text-muted-foreground">Platform access for dispatch, gate operators, and compliance auditors.</p>
      </div>
      <div className="kpi-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
            <tr className="border-b border-border">
              <th className="text-left font-medium py-3 px-4">Name</th>
              <th className="text-left font-medium py-3 px-4">Role</th>
              <th className="text-left font-medium py-3 px-4">Email</th>
              <th className="text-left font-medium py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {mock.map((u) => (
              <tr key={u.email} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                <td className="py-3 px-4 font-medium">{u.name}</td>
                <td className="py-3 px-4 text-muted-foreground">{u.role}</td>
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{u.email}</td>
                <td className="py-3 px-4">
                  <span className="chip border bg-primary/15 text-primary border-primary/30">
                    <ShieldCheck className="h-3 w-3" /> {u.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

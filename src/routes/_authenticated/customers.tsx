import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Search } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useCustomers, type Customer } from "@/hooks/use-customers";
import { CustomerModal } from "@/components/CustomerModal";

export const Route = createFileRoute("/_authenticated/customers")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({
    meta: [
      { title: "Customers — Me Do Logistics" },
      {
        name: "description",
        content: "Manage shippers and customers used for orders, rates and invoicing.",
      },
      { property: "og:title", content: "Customers — Me Do Logistics" },
      {
        property: "og:description",
        content: "Manage shippers and customers used for orders, rates and invoicing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: customers, isLoading, error } = useCustomers();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = customers ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.contact_info ?? "").toLowerCase().includes(term) ||
        (c.notes ?? "").toLowerCase().includes(term),
    );
  }, [customers, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Shippers used on orders, rate agreements and invoices.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Customer
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers…"
          className="w-full rounded-md border border-border bg-surface pl-8 pr-2 py-1.5 text-sm"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load customers"}
        </div>
      )}
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="kpi-card p-6 text-sm text-muted-foreground">
          No customers yet. Add your first one to use it on orders and rates.
        </div>
      )}

      {rows.length > 0 && (
        <div className="kpi-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                <tr className="border-b border-border">
                  <th className="text-left font-medium py-3 px-4">Customer</th>
                  <th className="text-left font-medium py-3 px-4">Contact</th>
                  <th className="text-left font-medium py-3 px-4">Notes</th>
                  <th className="px-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-4 font-medium">{c.name}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{c.contact_info ?? "—"}</td>
                    <td className="py-2.5 px-4 text-muted-foreground max-w-md truncate">
                      {c.notes ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setEditing(c)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && <CustomerModal onClose={() => setAdding(false)} />}
      {editing && <CustomerModal customer={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserCog, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users — TrailerFlow Pro" },
      { name: "description", content: "Manage dispatchers, DC managers, and gate guards in your organization." },
    ],
  }),
  component: UsersPage,
});

const ROLES: { id: AppRole; label: string; desc: string }[] = [
  { id: "admin", label: "Admin / DC Manager", desc: "Full access incl. settings, ingestion, users" },
  { id: "dispatcher", label: "Dispatcher", desc: "Control Tower + Tomorrow Board, assign & dispatch" },
  { id: "guard", label: "Gate Guard", desc: "Kiosk check-in / check-out only" },
];

type Member = { id: string; email: string | null; full_name: string | null; role: AppRole | null };

function UsersPage() {
  const { isAdmin, org, user } = useCurrentUser();

  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ["org-members", org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<Member[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles").select("id, email, full_name").eq("tenant_id", org!.id);
      if (error) { console.error(error.message); return []; }
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleFor = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p) => ({ ...p, role: roleFor.get(p.id) ?? null }));
    },
  });

  async function setRole(memberId: string, role: AppRole) {
    try {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", memberId);
      if (delErr) throw new Error(delErr.message);
      const { error } = await supabase.from("user_roles").insert({ user_id: memberId, role });
      if (error) throw new Error(error.message);
      toast.success("Role updated");
      void refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <UserCog className="h-6 w-6 text-primary" /> Users
        </h1>
        <p className="text-sm text-muted-foreground">
          {org?.name ?? "Your organization"} · dispatch, gate operators, and compliance access.
        </p>
      </div>

      {!isAdmin && (
        <p className="kpi-card p-4 text-sm text-muted-foreground">
          You can view your team, but only an Admin / DC Manager can change roles.
        </p>
      )}

      <div className="kpi-card overflow-hidden">
        {isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No teammates yet — invite them to sign up.</td></tr>
                )}
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                    <td className="px-4 py-3 font-medium">
                      {m.full_name ?? "—"}{m.id === user?.id && <span className="ml-2 text-[10px] text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={m.role ?? ""}
                          onChange={(e) => setRole(m.id, e.target.value as AppRole)}
                          className="rounded border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                        >
                          <option value="" disabled>No role</option>
                          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span className="chip border border-primary/30 bg-primary/15 text-primary">
                          <ShieldCheck className="h-3 w-3" /> {ROLES.find((r) => r.id === m.role)?.label ?? "No role"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.id} className="kpi-card p-4">
            <h3 className="text-sm font-semibold">{r.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

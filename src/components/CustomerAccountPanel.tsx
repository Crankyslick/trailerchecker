import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Star, Trash2, Phone, Mail, StickyNote, Users, Cog } from "lucide-react";
import {
  useClientContacts,
  useClientActivities,
  useClientTerms,
  addClientContact,
  setPrimaryContact,
  deleteClientContact,
  logClientActivity,
  updateClientTerms,
  type ClientActivity,
} from "@/hooks/use-commercial";
import type { Customer } from "@/hooks/use-customers";

const ICON: Record<ClientActivity["activity_type"], typeof Phone> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  meeting: Users,
  system: Cog,
};

const input = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

export function CustomerAccountPanel({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"contacts" | "activity" | "terms">("contacts");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg bg-surface border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-xs text-muted-foreground">Customer account</div>
            <div className="font-semibold">{customer.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          {(["contacts", "activity", "terms"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {t === "terms" ? "Terms & credit" : t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "contacts" && <Contacts clientId={customer.id} />}
          {tab === "activity" && <Activity clientId={customer.id} />}
          {tab === "terms" && <Terms clientId={customer.id} />}
        </div>
      </div>
    </div>
  );
}

function Contacts({ clientId }: { clientId: string }) {
  const { data: contacts = [], refetch } = useClientContacts(clientId);
  const [f, setF] = useState({ name: "", title: "", email: "", phone: "", primary: false });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await addClientContact({
        client_id: clientId,
        name: f.name,
        title: f.title || null,
        email: f.email || null,
        phone: f.phone || null,
        is_primary: f.primary || contacts.length === 0,
      });
      setF({ name: "", title: "", email: "", phone: "", primary: false });
      await refetch();
      toast.success("Contact added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add contact");
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {contacts.length === 0 && <div className="text-sm text-muted-foreground">No contacts yet.</div>}
        {contacts.map((c) => (
          <div key={c.id} className="rounded-md border border-border p-2.5 text-sm flex items-start justify-between gap-2">
            <div>
              <div className="font-medium flex items-center gap-1.5">
                {c.name}
                {c.is_primary && (
                  <span className="chip border bg-primary/10 text-primary border-primary/30 text-[10px]">Primary</span>
                )}
              </div>
              {c.title && <div className="text-xs text-muted-foreground">{c.title}</div>}
              <div className="text-xs text-muted-foreground">
                {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="flex gap-1">
              {!c.is_primary && (
                <button title="Make primary" onClick={() => run(() => setPrimaryContact(clientId, c.id))} className="p-1 text-muted-foreground hover:text-primary">
                  <Star className="h-4 w-4" />
                </button>
              )}
              <button title="Remove" onClick={() => run(() => deleteClientContact(c.id))} className="p-1 text-muted-foreground hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Add contact</div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={input} placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={input} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className={input} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.primary} onChange={(e) => setF({ ...f, primary: e.target.checked })} />
          Primary contact
        </label>
        <button onClick={add} disabled={busy} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          {busy ? "Saving…" : "Add contact"}
        </button>
      </div>
    </div>
  );
}

function Activity({ clientId }: { clientId: string }) {
  const { data: items = [], refetch } = useClientActivities(clientId);
  const [type, setType] = useState<"call" | "email" | "note" | "meeting">("call");
  const [note, setNote] = useState("");

  async function log() {
    try {
      await logClientActivity({ clientId, type, note });
      setNote("");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log activity");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex gap-2">
          <select className={`${input} w-32`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="note">Note</option>
          </select>
          <input className={input} placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && log()} />
        </div>
        <button onClick={log} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium">Log activity</button>
      </div>
      <ol className="space-y-2">
        {items.length === 0 && <li className="text-sm text-muted-foreground">No activity yet.</li>}
        {items.map((a) => {
          const Icon = ICON[a.activity_type] ?? StickyNote;
          return (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <div>{a.note ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground capitalize">
                  {a.activity_type} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Terms({ clientId }: { clientId: string }) {
  const { data, refetch } = useClientTerms(clientId);
  const [terms, setTerms] = useState("30");
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (data) {
      setTerms(String(data.payment_terms_days));
      setLimit(data.credit_limit == null ? "" : String(data.credit_limit));
    }
  }, [data]);

  async function save() {
    const t = Number(terms);
    if (!Number.isInteger(t) || t < 0 || t > 365) return toast.error("Payment terms must be 0–365 days");
    const l = limit.trim() === "" ? null : Number(limit);
    if (l != null && (Number.isNaN(l) || l < 0)) return toast.error("Credit limit must be a positive number");
    try {
      await updateClientTerms(clientId, { paymentTermsDays: t, creditLimit: l });
      await refetch();
      toast.success("Terms saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Payment terms (days)</label>
        <input className={input} value={terms} onChange={(e) => setTerms(e.target.value)} />
        <p className="text-[11px] text-muted-foreground mt-1">Sets the due date on new invoices.</p>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Credit limit ($)</label>
        <input className={input} placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <p className="text-[11px] text-muted-foreground mt-1">
          New invoices are blocked if they would push open (sent or disputed) balances over this amount.
        </p>
      </div>
      <button onClick={save} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium">Save terms</button>
    </div>
  );
}

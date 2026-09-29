import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createCustomer, updateCustomer, type Customer } from "@/hooks/use-customers";

type Props = {
  customer?: Customer;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
};

export function CustomerModal({ customer, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(customer?.name ?? "");
  const [contact, setContact] = useState(customer?.contact_info ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      if (customer) {
        await updateCustomer(customer.id, {
          name,
          contactInfo: contact.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success("Customer updated");
      } else {
        const created = await createCustomer({
          name,
          contactInfo: contact.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success("Customer added");
        onCreated?.(created);
      }
      await qc.invalidateQueries({ queryKey: ["trailer_clients"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          {customer ? "Edit Customer" : "New Customer"}
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Customer name</label>
            <input
              autoFocus
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Distribution"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Contact (name, email, phone)
            </label>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Jane Doe — jane@acme.com — 555-0134"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Notes</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Billing address, payment terms, special instructions"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : customer ? "Save" : "Add customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

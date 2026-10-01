import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  Loader2,
  ArrowRight,
  MapPin,
  Timer,
  Table2,
  Users,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, type AppRole } from "@/hooks/use-auth";
import { saveSyncConfig } from "@/lib/sync-config";
import { validateYardPolicy } from "@/lib/company-settings";
import type { BusinessModel } from "@/lib/brokerage";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your organization — Me Do Logistics" },
      {
        name: "description",
        content:
          "Add your company profile, yards, turnaround limits, data source, and team to finish setup.",
      },
      { property: "og:title", content: "Set up your organization — Me Do Logistics" },
      {
        property: "og:description",
        content: "Company profile, yards, turnaround limits, data source, and team invitations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

const MODELS: { id: BusinessModel; label: string; blurb: string }[] = [
  { id: "ASSET_BASED_3PL", label: "Asset-based carrier / 3PL", blurb: "Own trucks and trailers." },
  { id: "FREIGHT_BROKER", label: "Freight broker", blurb: "Tender freight to carriers." },
  { id: "HYBRID", label: "Hybrid", blurb: "Own fleet plus brokered freight." },
];

const INVITE_ROLES: { id: AppRole; label: string }[] = [
  { id: "admin", label: "Admin / DC Manager" },
  { id: "dispatcher", label: "Dispatcher" },
  { id: "guard", label: "Gate guard" },
  { id: "billing", label: "Billing" },
  { id: "driver", label: "Driver" },
];

type YardDraft = {
  key: string;
  name: string;
  code: string;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  latitude: string;
  longitude: string;
  geofence_radius_m: string;
  gate_hours: string;
  contact_phone: string;
  is_default: boolean;
};

type InviteDraft = { key: string; email: string; role: AppRole };

const newKey = () => Math.random().toString(36).slice(2);

const emptyYard = (isDefault: boolean): YardDraft => ({
  key: newKey(),
  name: "",
  code: "",
  address_line: "",
  city: "",
  region: "",
  postal_code: "",
  latitude: "",
  longitude: "",
  geofence_radius_m: "",
  gate_hours: "",
  contact_phone: "",
  is_default: isDefault,
});

const STEPS = [
  { n: 1, label: "Company", icon: Building2 },
  { n: 2, label: "Yards", icon: MapPin },
  { n: 3, label: "Timings", icon: Timer },
  { n: 4, label: "Data", icon: Table2 },
  { n: 5, label: "Team", icon: Users },
];

function Onboarding() {
  const navigate = useNavigate();
  const { org, profile, user, isAdmin, loading, refetch } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1 — company profile
  const [name, setName] = useState("");
  const [model, setModel] = useState<BusinessModel>("ASSET_BASED_3PL");
  const [dispatchPhone, setDispatchPhone] = useState("");
  const [mcNumber, setMcNumber] = useState("");
  const [dotNumber, setDotNumber] = useState("");

  // Step 2 — yards
  const [yards, setYards] = useState<YardDraft[]>([emptyYard(true)]);

  // Step 3 — timings
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [criticalHours, setCriticalHours] = useState(48);

  // Step 4 — data source
  const [spreadsheet, setSpreadsheet] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvName, setCsvName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Step 5 — team
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("dispatcher");

  useEffect(() => {
    if (org?.name && !name) setName(org.name);
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateYard(key: string, patch: Partial<YardDraft>) {
    setYards((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function makeDefault(key: string) {
    setYards((rows) => rows.map((r) => ({ ...r, is_default: r.key === key })));
  }

  function removeYard(key: string) {
    setYards((rows) => {
      const left = rows.filter((r) => r.key !== key);
      if (left.length && !left.some((r) => r.is_default)) left[0].is_default = true;
      return left.length ? left : [emptyYard(true)];
    });
  }

  function addInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (invites.some((i) => i.email === email)) {
      toast.error("That email is already on the list.");
      return;
    }
    setInvites((rows) => [...rows, { key: newKey(), email, role: inviteRole }]);
    setInviteEmail("");
  }

  async function onPickCsv(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      toast.error("That file has no rows we can read.");
      return;
    }
    setCsvRows(rows);
    setCsvName(file.name);
    toast.success(`${rows.length} row(s) ready to import.`);
  }

  function validateStep(n: number): string | null {
    if (n === 1 && !name.trim()) return "Enter your company name.";
    if (n === 2) {
      const named = yards.filter((y) => y.name.trim());
      if (!named.length) return "Add at least one yard with a name.";
      for (const y of named) {
        if (y.latitude.trim() && Number.isNaN(Number(y.latitude)))
          return `Check the map coordinates for ${y.name}.`;
        if (y.longitude.trim() && Number.isNaN(Number(y.longitude)))
          return `Check the map coordinates for ${y.name}.`;
      }
    }
    if (n === 3) {
      return validateYardPolicy({ deadlineHours, criticalHours });
    }
    return null;
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      toast.error(problem);
      return;
    }
    setStep((s) => Math.min(STEPS.length, s + 1));
  }

  async function finish() {
    for (let n = 1; n <= 3; n++) {
      const problem = validateStep(n);
      if (problem) {
        setStep(n);
        toast.error(problem);
        return;
      }
    }
    if (!org?.id) {
      toast.error("No organization is linked to your account yet.");
      return;
    }

    setBusy(true);
    try {
      const { data: company } = await supabase.from("companies").select("id").limit(1).maybeSingle();
      const companyId = (company as { id: string } | null)?.id ?? null;
      if (!companyId) throw new Error("No company is linked to your account.");

      const namedYards = yards.filter((y) => y.name.trim());

      // 1. Company profile
      const { error: companyError } = await supabase
        .from("companies")
        .update({
          name: name.trim(),
          dispatch_phone: dispatchPhone.trim() || null,
          mc_number: mcNumber.trim() || null,
          dot_number: dotNumber.trim() || null,
        })
        .eq("id", companyId);
      if (companyError) throw new Error(companyError.message);

      // 2. Settings: operating profile + turnaround limits (one upsert)
      const { error: settingsError } = await supabase.from("company_settings").upsert(
        {
          company_id: companyId,
          business_model: model,
          yard_deadline_hours: deadlineHours,
          yard_critical_hours: criticalHours,
        },
        { onConflict: "company_id" },
      );
      if (settingsError) throw new Error(settingsError.message);

      // 3. Yards
      if (namedYards.length) {
        const rows = namedYards.map((y) => ({
          company_id: companyId,
          name: y.name.trim(),
          code: y.code.trim() || null,
          kind: "yard",
          is_default: y.is_default,
          active: true,
          address_line: y.address_line.trim() || null,
          city: y.city.trim() || null,
          region: y.region.trim() || null,
          postal_code: y.postal_code.trim() || null,
          latitude: y.latitude.trim() ? Number(y.latitude) : null,
          longitude: y.longitude.trim() ? Number(y.longitude) : null,
          geofence_radius_m: y.geofence_radius_m.trim()
            ? Number(y.geofence_radius_m) || null
            : null,
          gate_hours: y.gate_hours.trim() || null,
          contact_phone: y.contact_phone.trim() || null,
        }));
        const { error: siteError } = await supabase.from("company_sites").insert(rows);
        if (siteError) throw new Error(siteError.message);
      }

      // 4. Sheet connection (optional)
      if (spreadsheet.trim() || webhookUrl.trim()) {
        await saveSyncConfig({
          spreadsheet_id: extractSpreadsheetId(spreadsheet) || null,
          sheet_name: sheetName.trim() || "Sheet1",
          webhook_url: webhookUrl.trim() || null,
        });
      }

      // 4b. Optional starter rows from an uploaded sheet
      if (csvRows.length) {
        const inserts = csvRows
          .map(toLoadInsert)
          .filter((r): r is Database["public"]["Tables"]["trailer_loads"]["Insert"] => r !== null);
        if (inserts.length) {
          const { error: loadError } = await supabase.from("trailer_loads").insert(inserts);
          if (loadError) toast.error(`Loads not imported: ${loadError.message}`);
        }
      }

      // 5. Invitations
      if (invites.length) {
        const { error: inviteError } = await supabase.from("tenant_invites").upsert(
          invites.map((i) => ({
            tenant_id: org.id,
            email: i.email,
            role: i.role,
            invited_by: user?.id ?? null,
            accepted_at: null,
          })),
          { onConflict: "tenant_id,email" },
        );
        if (inviteError) toast.error(`Invites not saved: ${inviteError.message}`);
      }

      // 6. Mark onboarded
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          name: name.trim() || org.name,
          yard_count: Math.max(1, namedYards.length),
          onboarded: true,
        })
        .eq("id", org.id);
      if (tenantError) throw new Error(tenantError.message);

      toast.success("Setup complete.");
      await refetch();
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6 text-primary" /> Set up your organization
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {profile?.full_name ?? profile?.email ?? "—"} · you are the administrator of
          this account.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n}>
              <button
                onClick={() => setStep(s.n)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : done
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-muted-foreground hover:bg-surface-2/60"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {!isAdmin && (
        <p className="kpi-card p-4 text-sm text-muted-foreground">
          Only an administrator can finish setup. Ask your admin to complete this.
        </p>
      )}

      <div className="kpi-card space-y-4 p-5">
        {step === 1 && (
          <>
            <Field label="Company name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vital Transportation Corporation"
                className={inputClass}
              />
            </Field>
            <Field label="How do you operate?">
              <div className="grid gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`rounded-md border p-3 text-left ${
                      model === m.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border hover:bg-surface-2/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{m.label}</span>
                      {model === m.id && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.blurb}</div>
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Dispatch phone">
                <input
                  value={dispatchPhone}
                  onChange={(e) => setDispatchPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className={inputClass}
                />
              </Field>
              <Field label="MC number">
                <input
                  value={mcNumber}
                  onChange={(e) => setMcNumber(e.target.value)}
                  placeholder="123456"
                  className={inputClass}
                />
              </Field>
              <Field label="DOT number">
                <input
                  value={dotNumber}
                  onChange={(e) => setDotNumber(e.target.value)}
                  placeholder="7654321"
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-xs text-muted-foreground">
              Add every yard or terminal you operate. The default yard is used by the gate kiosk and
              the yard board.
            </p>
            <div className="space-y-3">
              {yards.map((y, i) => (
                <div key={y.key} className="rounded-md border border-border/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Yard {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => makeDefault(y.key)}
                        className={`rounded px-2 py-1 text-[11px] ${
                          y.is_default
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-surface-2"
                        }`}
                      >
                        {y.is_default ? "Default yard" : "Make default"}
                      </button>
                      <button
                        onClick={() => removeYard(y.key)}
                        className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                        title="Remove yard"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Yard name">
                      <input
                        value={y.name}
                        onChange={(e) => updateYard(y.key, { name: e.target.value })}
                        placeholder="Main Yard"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Code">
                      <input
                        value={y.code}
                        onChange={(e) => updateYard(y.key, { code: e.target.value })}
                        placeholder="YARD-01"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Street address">
                      <input
                        value={y.address_line}
                        onChange={(e) => updateYard(y.key, { address_line: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="City">
                      <input
                        value={y.city}
                        onChange={(e) => updateYard(y.key, { city: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="State / region">
                      <input
                        value={y.region}
                        onChange={(e) => updateYard(y.key, { region: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="ZIP / postal code">
                      <input
                        value={y.postal_code}
                        onChange={(e) => updateYard(y.key, { postal_code: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Latitude (optional)">
                      <input
                        value={y.latitude}
                        onChange={(e) => updateYard(y.key, { latitude: e.target.value })}
                        placeholder="39.9376"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Longitude (optional)">
                      <input
                        value={y.longitude}
                        onChange={(e) => updateYard(y.key, { longitude: e.target.value })}
                        placeholder="-77.6611"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Arrival radius (meters)">
                      <input
                        value={y.geofence_radius_m}
                        onChange={(e) => updateYard(y.key, { geofence_radius_m: e.target.value })}
                        placeholder="250"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Gate hours">
                      <input
                        value={y.gate_hours}
                        onChange={(e) => updateYard(y.key, { gate_hours: e.target.value })}
                        placeholder="Mon–Fri 06:00–22:00"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Guard / gate phone">
                      <input
                        value={y.contact_phone}
                        onChange={(e) => updateYard(y.key, { contact_phone: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setYards((rows) => [...rows, emptyYard(rows.length === 0)])}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2/60"
            >
              <Plus className="h-4 w-4" /> Add another yard
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-xs text-muted-foreground">
              Trailers turn yellow after the turnaround limit and red after the critical limit.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Turnaround limit (hours)">
                <input
                  type="number"
                  min={1}
                  value={deadlineHours}
                  onChange={(e) => setDeadlineHours(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              <Field label="Critical limit (hours)">
                <input
                  type="number"
                  min={2}
                  value={criticalHours}
                  onChange={(e) => setCriticalHours(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-xs text-muted-foreground">
              Connect your Google Sheet or upload a file to start with. You can skip this and set it
              up later in Settings.
            </p>
            <Field label="Google Sheet link or ID">
              <input
                value={spreadsheet}
                onChange={(e) => setSpreadsheet(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className={inputClass}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tab name">
                <input
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Sheet webhook address (optional)">
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/..."
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                Or upload a sheet (CSV)
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickCsv(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2/60"
              >
                <Upload className="h-4 w-4" /> Choose a CSV file
              </button>
              {csvName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {csvName} · {csvRows.length} row(s) will be imported when you finish.
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Columns we read: Schedule ID, Trailer #, Driver, Destination, Origin, Schedule Date.
              </p>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-xs text-muted-foreground">
              Invite your team and set each person's role. They join automatically when they sign up
              with that email.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className={`flex-1 ${inputClass}`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as AppRole)}
                className={inputClass}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                onClick={addInvite}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {invites.length > 0 && (
              <div className="divide-y divide-border/40 rounded-md border border-border/60">
                {invites.map((i) => (
                  <div
                    key={i.key}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{i.email}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {INVITE_ROLES.find((r) => r.id === i.role)?.label ?? i.role}
                      </div>
                    </div>
                    <button
                      onClick={() => setInvites((rows) => rows.filter((r) => r.key !== i.key))}
                      className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-between pt-1">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Back
          </button>
          {step < STEPS.length ? (
            <button
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={busy || !isAdmin}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function extractSpreadsheetId(input: string): string {
  const value = input.trim();
  if (!value) return "";
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : value;
}

/** Minimal, quote-aware CSV reader for the starter upload. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => {
    const out: Record<string, string> = {};
    keys.forEach((k, i) => (out[k] = (r[i] ?? "").trim()));
    return out;
  });
}

/** Maps an uploaded row to a load, or null when it has no usable ID. */
export function toLoadInsert(
  row: Record<string, string>,
): Database["public"]["Tables"]["trailer_loads"]["Insert"] | null {
  const scheduleId = row["Schedule ID"] || row["Load ID"] || row["schedule_id"];
  if (!scheduleId) return null;
  const insert: Record<string, unknown> = { schedule_id: scheduleId };
  const trailer = row["Trailer #"] || row["Outbound Trailer"];
  if (trailer) insert.outbound_trailer = trailer;
  if (row["Driver"]) insert.driver = row["Driver"];
  if (row["Destination"]) insert.str_name = row["Destination"];
  if (row["Origin"]) insert.origin_name = row["Origin"];
  if (row["Schedule Date"]) insert.schedule_date = row["Schedule Date"];
  // order_id / shipment_id / leg_id are filled by the auto-provision trigger.
  return insert as Database["public"]["Tables"]["trailer_loads"]["Insert"];
}

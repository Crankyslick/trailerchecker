import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EXCEPTION_TYPES = [
  "DETENTION",
  "LAYOVER",
  "TONU",
  "REDELIVERY",
  "LUMPER",
  "YARD_DWELL",
  "RETURN_TRAILER_MISSING",
  "TRAILER_MISMATCH",
  "POD_MISSING",
  "DAMAGE",
  "OTHER",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const CASE_STATUSES = [
  "OPEN",
  "EVIDENCE_READY",
  "IN_REVIEW",
  "RESOLVED",
  "WRITTEN_OFF",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const RESPONSIBLE_PARTIES = [
  "UNKNOWN",
  "SHIPPER",
  "CARRIER",
  "BROKER",
  "SHARED",
] as const;
export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const TRAILER_ROLES = ["NOT_APPLICABLE", "OUTBOUND", "RETURN"] as const;
export type TrailerRole = (typeof TRAILER_ROLES)[number];

export const CLAIM_STATUSES = [
  "NOT_APPLICABLE",
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PARTIALLY_PAID",
  "PAID",
  "WRITTEN_OFF",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const EVIDENCE_KINDS = [
  "PHOTO",
  "POD",
  "BOL",
  "RECEIPT",
  "RATE_CONFIRMATION",
  "ARRIVAL_RECORD",
  "DEPARTURE_RECORD",
  "DRIVER_NOTE",
  "GATE_NOTE",
  "OTHER",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Human wording for the codes stored in the database. */
export const LABELS: Record<string, string> = {
  DETENTION: "Detention",
  LAYOVER: "Layover",
  TONU: "Truck ordered, not used",
  REDELIVERY: "Redelivery",
  LUMPER: "Lumper fee",
  YARD_DWELL: "Yard dwell",
  RETURN_TRAILER_MISSING: "Return trailer missing",
  TRAILER_MISMATCH: "Trailer mismatch",
  POD_MISSING: "Missing delivery proof",
  DAMAGE: "Damage",
  OTHER: "Other",
  OPEN: "Open",
  EVIDENCE_READY: "Evidence ready",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
  WRITTEN_OFF: "Written off",
  UNKNOWN: "Not decided",
  SHIPPER: "Shipper",
  CARRIER: "Carrier",
  BROKER: "Broker",
  SHARED: "Shared",
  NOT_APPLICABLE: "Not applicable",
  OUTBOUND: "Outbound trailer",
  RETURN: "Return trailer",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  PHOTO: "Photo",
  POD: "Delivery proof",
  BOL: "Bill of lading",
  RECEIPT: "Receipt",
  RATE_CONFIRMATION: "Rate confirmation",
  ARRIVAL_RECORD: "Arrival record",
  DEPARTURE_RECORD: "Departure record",
  DRIVER_NOTE: "Driver note",
  GATE_NOTE: "Gate note",
};

export function label(code: string | null | undefined): string {
  if (!code) return "—";
  return LABELS[code] ?? code;
}

export type ExceptionCase = {
  id: string;
  company_id: string;
  load_id: string;
  stop_id: string | null;
  exception_type: ExceptionType;
  case_status: CaseStatus;
  responsible_party: ResponsibleParty;
  trailer_role: TrailerRole;
  trailer_number: string | null;
  facility_name: string | null;
  occurred_at: string;
  arrived_at: string | null;
  departed_at: string | null;
  free_time_minutes: number | null;
  carrier_rate_per_hour: number | null;
  customer_rate_per_hour: number | null;
  description: string | null;
  carrier_claim_status: ClaimStatus;
  customer_claim_status: ClaimStatus;
  currency_code: string;
  carrier_amount_claimed: number | null;
  carrier_amount_approved: number | null;
  carrier_amount_paid: number | null;
  customer_amount_claimed: number | null;
  customer_amount_approved: number | null;
  customer_amount_paid: number | null;
  created_at: string;
  updated_at: string;
};

export type CaseEvidence = {
  id: string;
  case_id: string;
  evidence_kind: EvidenceKind;
  capture_source: string;
  captured_at: string;
  storage_path: string | null;
  note: string | null;
  source_reference: string | null;
  created_at: string;
};

export type CaseEvent = {
  id: string;
  case_id: string;
  event_type: string;
  details: unknown;
  created_at: string;
};

const CASE_COLUMNS =
  "id, company_id, load_id, stop_id, exception_type, case_status, responsible_party, trailer_role, trailer_number, facility_name, occurred_at, arrived_at, departed_at, free_time_minutes, carrier_rate_per_hour, customer_rate_per_hour, description, carrier_claim_status, customer_claim_status, currency_code, carrier_amount_claimed, carrier_amount_approved, carrier_amount_paid, customer_amount_claimed, customer_amount_approved, customer_amount_paid, created_at, updated_at";

export const CASES_KEY = ["exception_cases"] as const;

export function useExceptionCases() {
  return useQuery({
    queryKey: CASES_KEY,
    queryFn: async (): Promise<ExceptionCase[]> => {
      const { data, error } = await supabase
        .from("exception_cases")
        .select(CASE_COLUMNS)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ExceptionCase[];
    },
    placeholderData: keepPreviousData,
  });
}

/** Loads a dispatcher can file a case against. */
export type CaseLoadOption = {
  id: string;
  schedule_id: string;
  str_name: string | null;
  outbound_trailer: string | null;
  return_trailer: string | null;
};

export function useCaseLoadOptions() {
  return useQuery({
    queryKey: ["exception_cases", "load-options"],
    queryFn: async (): Promise<CaseLoadOption[]> => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .select("id, schedule_id, str_name, outbound_trailer, return_trailer")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as CaseLoadOption[];
    },
    staleTime: 60_000,
  });
}

export function useCaseEvidence(caseId: string | null) {
  return useQuery({
    queryKey: ["exception_case_evidence", caseId],
    enabled: Boolean(caseId),
    queryFn: async (): Promise<CaseEvidence[]> => {
      const { data, error } = await supabase
        .from("exception_case_evidence")
        .select(
          "id, case_id, evidence_kind, capture_source, captured_at, storage_path, note, source_reference, created_at",
        )
        .eq("case_id", caseId!)
        .order("captured_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CaseEvidence[];
    },
  });
}

export function useCaseEvents(caseId: string | null) {
  return useQuery({
    queryKey: ["exception_case_events", caseId],
    enabled: Boolean(caseId),
    queryFn: async (): Promise<CaseEvent[]> => {
      const { data, error } = await supabase
        .from("exception_case_events")
        .select("id, case_id, event_type, details, created_at")
        .eq("case_id", caseId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CaseEvent[];
    },
  });
}

export type CaseInput = {
  load_id: string;
  exception_type: ExceptionType;
  case_status: CaseStatus;
  responsible_party: ResponsibleParty;
  trailer_role: TrailerRole;
  trailer_number: string | null;
  facility_name: string | null;
  occurred_at: string;
  arrived_at: string | null;
  departed_at: string | null;
  free_time_minutes: number | null;
  carrier_rate_per_hour: number | null;
  customer_rate_per_hour: number | null;
  description: string | null;
  carrier_claim_status: ClaimStatus;
  customer_claim_status: ClaimStatus;
  carrier_amount_claimed: number | null;
  carrier_amount_approved: number | null;
  carrier_amount_paid: number | null;
  customer_amount_claimed: number | null;
  customer_amount_approved: number | null;
  customer_amount_paid: number | null;
};

export async function createExceptionCase(input: CaseInput): Promise<ExceptionCase> {
  const { data, error } = await supabase
    .from("exception_cases")
    .insert(input as never)
    .select(CASE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ExceptionCase;
}

export async function updateExceptionCase(id: string, input: Partial<CaseInput>) {
  const { error } = await supabase
    .from("exception_cases")
    .update(input as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "evidence";
}

/** Uploads to the private evidence area and records the matching row. */
export async function addEvidence(input: {
  caseId: string;
  companyId: string;
  kind: EvidenceKind;
  note: string | null;
  file: File | null;
}) {
  let storagePath: string | null = null;
  if (input.file) {
    storagePath = `${input.companyId}/${input.caseId}/${Date.now()}-${safeFileName(input.file.name)}`;
    const { error: upErr } = await supabase.storage
      .from("exception-evidence")
      .upload(storagePath, input.file, { upsert: false, contentType: input.file.type });
    if (upErr) throw new Error(upErr.message);
  }
  if (!storagePath && !input.note?.trim()) {
    throw new Error("Add a note or attach a file");
  }
  const { error } = await supabase.from("exception_case_evidence").insert({
    case_id: input.caseId,
    company_id: input.companyId,
    evidence_kind: input.kind,
    capture_source: "DISPATCHER",
    storage_path: storagePath,
    note: input.note?.trim() || null,
  } as never);
  if (error) throw new Error(error.message);
}

/** Short-lived link so staff can open a private evidence file. */
export async function evidenceUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("exception-evidence")
    .createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export function useInvalidateCases() {
  const qc = useQueryClient();
  return (caseId?: string) => {
    void qc.invalidateQueries({ queryKey: ["exception_cases"] });
    if (caseId) {
      void qc.invalidateQueries({ queryKey: ["exception_case_evidence", caseId] });
      void qc.invalidateQueries({ queryKey: ["exception_case_events", caseId] });
    }
  };
}

/** Billable time beyond the agreed free time, in hours. */
export function billableHours(c: ExceptionCase): number | null {
  if (!c.arrived_at || !c.departed_at) return null;
  const ms = new Date(c.departed_at).getTime() - new Date(c.arrived_at).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const free = (c.free_time_minutes ?? 0) * 60_000;
  return Math.max(0, (ms - free) / 3_600_000);
}

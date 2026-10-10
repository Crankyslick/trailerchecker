import { z } from "zod";

/**
 * Normalized JSON contract for rate confirmation imports.
 *
 * The server-side extractor (PDF text -> LLM/OCR) MUST validate its output with
 * `rateConfirmationSchema` before calling the `save_rate_confirmation_extraction` RPC.
 * Everything is optional because rate confirmations vary; the database validation
 * (`validate_rate_confirmation_import`) decides what blocks creation (errors) and
 * what only needs review (warnings).
 *
 * Confidence is NOT part of this document. It is a separate `Record<dotted.path, 0..1>`
 * stored on the import row, e.g. { "load.external_load_number": 0.99 }.
 */

const text = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().max(500).optional().nullable(),
);

/** Accepts 1800, "1800", "$1,800.00". Non-numeric strings are left as-is so the DB reports them. */
const amount = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const cleaned = v.replace(/[$,\s]/g, "");
    return cleaned !== "" && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : v;
  },
  z.union([z.number(), z.string()]).optional().nullable(),
);

const stopType = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().optional().nullable(),
);

export const rateConfirmationStopSchema = z.object({
  sequence: z.number().int().positive().optional().nullable(),
  type: stopType,
  facility_name: text,
  location_code: text,
  address1: text,
  address2: text,
  city: text,
  state: text,
  postal_code: text,
  country: text,
  appointment_start: text, // ISO 8601
  appointment_end: text, // ISO 8601
  appointment_confirmation: text,
  contact_name: text,
  contact_phone: text,
  instructions: text,
});

export const rateConfirmationSchema = z.object({
  broker: z
    .object({ name: text, mc_number: text, dot_number: text, email: text, phone: text })
    .optional(),
  customer: z.object({ name: text, reference_number: text }).optional(),
  shipper: z.object({ name: text }).optional(),
  /** Operating carrier AS PRINTED on the document (the hauling carrier = this company by default). */
  carrier: z.object({ name: text, mc_number: text, dot_number: text }).optional(),
  load: z
    .object({
      external_load_number: text,
      po_number: text,
      bol_number: text,
      confirmation_number: text,
      commodity: text,
      weight_lbs: amount,
      pieces: amount,
      equipment_type: text,
      special_instructions: text,
    })
    .optional(),
  rate: z
    .object({
      linehaul: amount,
      fuel_surcharge: amount,
      accessorials: z.array(z.object({ code: text, description: text, amount })).optional(),
      total: amount,
      currency: text, // defaults to USD in the database; anything else is a blocking error
    })
    .optional(),
  stops: z.array(rateConfirmationStopSchema).optional(),
  /** Assignment suggestions. Applied ONLY when the reviewer sets apply_assignment = true. */
  dispatch: z
    .object({
      driver_name: text,
      driver_phone: text,
      tractor_number: text,
      trailer_number: text,
      apply_assignment: z.boolean().optional(),
    })
    .optional(),
});

export type RateConfirmationData = z.infer<typeof rateConfirmationSchema>;
export type RateConfirmationConfidence = Record<string, number>;

export type ValidationIssue = { code: string; field: string; message: string };
export type ValidationResult = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  valid: boolean;
};

/** Result shapes of the `import_rate_confirmation` RPC (it reports problems, it does not throw them). */
export type ImportRateConfirmationResult =
  | {
      success: true;
      already_imported?: boolean;
      import_id: string;
      order_id: string;
      shipment_id: string;
      leg_ids: string[];
      trailer_load_id: string;
      client_id: string;
      operating_mode?: "OWN_FLEET";
      assignment?: Record<string, boolean | string>;
      warnings?: ValidationIssue[];
    }
  | {
      success: false;
      blocked: true;
      import_id: string;
      errors: ValidationIssue[];
      warnings: ValidationIssue[];
    }
  | {
      success: false;
      duplicate: true;
      import_id: string;
      duplicate_of_import_id: string | null;
      existing_order_id: string | null;
      existing_trailer_load_id: string | null;
      message: string;
    }
  | { success: false; failed: true; import_id: string; error: string };

/** Validate extractor output; unknown keys are dropped, numeric-looking strings become numbers. */
export function normalizeRateConfirmation(raw: unknown): RateConfirmationData {
  return rateConfirmationSchema.parse(raw);
}

// Server-only: sends a rate confirmation PDF to the Lovable AI Gateway and
// returns structured fields. Never import from client code.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const s = { type: ["string", "null"] } as const;
const n = { type: ["number", "null"] } as const;
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

const stop = obj({
  sequence: { type: ["integer", "null"] },
  type: { type: "string", enum: ["pickup", "delivery"] },
  facility_name: s, location_code: s, address1: s, address2: s, city: s, state: s,
  postal_code: s, country: s, appointment_start: s, appointment_end: s,
  appointment_confirmation: s, contact_name: s, contact_phone: s, instructions: s,
});

const schema = obj({
  data: obj({
    broker: obj({ name: s, mc_number: s, dot_number: s, email: s, phone: s }),
    customer: obj({ name: s, reference_number: s }),
    shipper: obj({ name: s }),
    carrier: obj({ name: s, mc_number: s, dot_number: s }),
    load: obj({
      external_load_number: s, po_number: s, bol_number: s, confirmation_number: s,
      commodity: s, weight_lbs: n, pieces: n, equipment_type: s, special_instructions: s,
    }),
    rate: obj({
      linehaul: n, fuel_surcharge: n, total: n, currency: s,
      accessorials: { type: "array", items: obj({ code: s, description: s, amount: n }) },
    }),
    stops: { type: "array", items: stop },
    dispatch: obj({ driver_name: s, driver_phone: s, tractor_number: s, trailer_number: s }),
  }),
  confidence: {
    type: "array",
    items: obj({ field: { type: "string" }, score: { type: "number" } }),
  },
});

const INSTRUCTIONS = `You extract data from a trucking rate confirmation document.
Return only values printed on the document; use null when a value is absent. Never guess.
Dates/times: ISO 8601 with timezone offset if known. Amounts in USD numbers without symbols.
Stops in route order, sequence starting at 1. "broker" is the party paying for the load.
"confidence": one entry per field you filled, path like "load.external_load_number" or "stops[0].city", score 0..1.`;

export class ExtractionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function extractRateConfirmation(pdfBase64: string, filename: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new ExtractionError("AI is not configured for this app", 401);
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", filename, file_data: `data:application/pdf;base64,${pdfBase64}` },
            { type: "input_text", text: "Extract this rate confirmation." },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "rate_confirmation", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string };
      msg = j.error?.message ?? j.message ?? msg;
    } catch { /* ignore */ }
    throw new ExtractionError(msg, res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  let finalText: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: string; text?: string; error?: { message?: string } };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.output_text.done" && typeof ev.text === "string") finalText = ev.text;
        else if (ev.type === "error" || ev.type === "response.failed")
          throw new ExtractionError(ev.error?.message ?? "AI extraction failed", 502);
      } catch (e) {
        if (e instanceof ExtractionError) throw e;
      }
    }
  }
  const text = finalText ?? out;
  if (!text) throw new ExtractionError("The AI returned no data for this document", 502);
  const parsed = JSON.parse(text) as {
    data: Record<string, unknown>;
    confidence: { field: string; score: number }[];
  };
  const confidence: Record<string, number> = {};
  for (const c of parsed.confidence ?? []) confidence[c.field] = c.score;
  return { raw: parsed, data: parsed.data, confidence };
}

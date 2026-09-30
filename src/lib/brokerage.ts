export const BUSINESS_MODELS = ["ASSET_BASED_3PL", "FREIGHT_BROKER", "HYBRID"] as const;

export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const BUSINESS_MODEL_OPTIONS: {
  value: BusinessModel;
  label: string;
  description: string;
}[] = [
  {
    value: "ASSET_BASED_3PL",
    label: "Asset-based carrier / 3PL",
    description: "Run your own drivers and equipment, with partner-carrier overflow when needed.",
  },
  {
    value: "FREIGHT_BROKER",
    label: "Freight broker",
    description:
      "Manage shipper orders, carrier coverage, buy/sell rates and billing without requiring your own fleet.",
  },
  {
    value: "HYBRID",
    label: "Both",
    description: "Operate owned capacity and brokered/partner-carrier freight in one workspace.",
  },
];

export function normalizeBusinessModel(value: unknown): BusinessModel {
  return BUSINESS_MODELS.includes(value as BusinessModel)
    ? (value as BusinessModel)
    : "ASSET_BASED_3PL";
}

export function businessModelLabel(value: unknown): string {
  return BUSINESS_MODEL_OPTIONS.find((option) => option.value === normalizeBusinessModel(value))!
    .label;
}

export function validateOfferedRate(value: string): string | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "Enter a non-negative carrier rate.";
  return null;
}

export function buildTenderMailto(input: {
  recipient: string | null | undefined;
  shipmentNumber: string | null | undefined;
  origin: string | null | undefined;
  destination: string | null | undefined;
  offeredRate: number | null;
}): string | null {
  const recipient = input.recipient?.trim().replace(/[\r\n]/g, "");
  if (!recipient) return null;

  const shipment = input.shipmentNumber?.trim() || "Load";
  const origin = input.origin?.trim() || "Origin TBD";
  const destination = input.destination?.trim() || "Destination TBD";
  const rate = input.offeredRate == null ? "Not specified" : `$${input.offeredRate.toFixed(2)}`;
  const subject = `Carrier offer — ${shipment} — ${origin} to ${destination}`;
  const body = [
    "Hello,",
    "",
    "Please review this carrier offer:",
    `Load: ${shipment}`,
    `Lane: ${origin} to ${destination}`,
    `Carrier pay offered: ${rate}`,
    "",
    "Please reply to confirm acceptance or rejection. The dispatcher will record your response in the operations system.",
    "",
    "This message is a manually prepared draft. It has not been sent, and carrier outreach and response are handled by email.",
  ].join("\n");

  const encodedRecipient = encodeURIComponent(recipient).replace(/%40/gi, "@");
  return `mailto:${encodedRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

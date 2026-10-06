import { describe, expect, it } from "vitest";
import {
  BUSINESS_MODEL_OPTIONS,
  buildTenderMailto,
  buildTenderResponseUrl,
  businessModelLabel,
  normalizeBusinessModel,
  validateOfferedRate,
} from "./brokerage";

describe("business model settings", () => {
  it("supports asset-based, freight broker and hybrid organizations", () => {
    expect(BUSINESS_MODEL_OPTIONS.map((item) => item.value)).toEqual([
      "ASSET_BASED_3PL",
      "FREIGHT_BROKER",
      "HYBRID",
    ]);
  });

  it("normalizes invalid or missing values to the backward-compatible asset-based default", () => {
    expect(normalizeBusinessModel(undefined)).toBe("ASSET_BASED_3PL");
    expect(normalizeBusinessModel("unknown")).toBe("ASSET_BASED_3PL");
    expect(normalizeBusinessModel("FREIGHT_BROKER")).toBe("FREIGHT_BROKER");
    expect(businessModelLabel("HYBRID")).toBe("Both");
  });
});

describe("manual carrier tender drafts", () => {
  it("builds an encoded mail draft with the lane, load and offer", () => {
    const mailto = buildTenderMailto({
      recipient: "ops@example.com",
      shipmentNumber: "ORD-123",
      origin: "New York, NY",
      destination: "Boston, MA",
      offeredRate: 1250.5,
    });
    expect(mailto).toContain("mailto:ops@example.com");
    expect(decodeURIComponent(mailto ?? "")).toContain("ORD-123");
    expect(decodeURIComponent(mailto ?? "")).toContain("$1250.50");
    expect(decodeURIComponent(mailto ?? "")).toContain("has not been sent");
  });

  it("does not build an email link without a carrier contact email", () => {
    expect(
      buildTenderMailto({
        recipient: " \r\n ",
        shipmentNumber: "ORD-123",
        origin: null,
        destination: null,
        offeredRate: null,
      }),
    ).toBeNull();
  });

  it("validates optional, non-negative rate values", () => {
    expect(validateOfferedRate("")).toBeNull();
    expect(validateOfferedRate("1200.25")).toBeNull();
    expect(validateOfferedRate("-1")).toContain("non-negative");
    expect(validateOfferedRate("bad")).toContain("non-negative");
  });

  it("builds the zero-login carrier response link from a token, or nothing without one", () => {
    expect(buildTenderResponseUrl(null)).toBeNull();
    expect(buildTenderResponseUrl(undefined)).toBeNull();
    expect(buildTenderResponseUrl("abc123")).toContain("/tenders/respond?token=abc123");
  });

  it("includes the carrier response link in the mail draft when one is available", () => {
    const mailto = buildTenderMailto({
      recipient: "ops@example.com",
      shipmentNumber: "ORD-123",
      origin: "New York, NY",
      destination: "Boston, MA",
      offeredRate: 1250.5,
      responseUrl: "https://app.example.com/tenders/respond?token=abc123",
    });
    const decoded = decodeURIComponent(mailto ?? "");
    expect(decoded).toContain("https://app.example.com/tenders/respond?token=abc123");
    expect(decoded).toContain("no account needed");
  });
});

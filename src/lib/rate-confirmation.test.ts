import { describe, expect, it } from "vitest";
import { normalizeRateConfirmation, rateConfirmationSchema } from "./rate-confirmation";

describe("rate confirmation contract", () => {
  it("accepts a full 1-pick / 1-drop document", () => {
    const data = normalizeRateConfirmation({
      broker: { name: "Acme Brokerage", mc_number: "MC-998877" },
      load: { external_load_number: "ABC-12345", weight_lbs: 42000 },
      rate: { linehaul: 1800, fuel_surcharge: 200, total: 2000, currency: "USD" },
      stops: [
        { sequence: 1, type: "pickup", facility_name: "Paper Mill" },
        { sequence: 2, type: "delivery", facility_name: "Big Store DC" },
      ],
    });
    expect(data.stops).toHaveLength(2);
    expect(data.rate?.linehaul).toBe(1800);
  });

  it("tolerates a minimal document with every optional value missing", () => {
    expect(() => normalizeRateConfirmation({})).not.toThrow();
    expect(() =>
      normalizeRateConfirmation({ broker: { name: "Gamma" }, stops: [{ type: "pickup" }] }),
    ).not.toThrow();
  });

  it("turns currency-formatted strings into numbers and leaves garbage for the database to flag", () => {
    const data = normalizeRateConfirmation({
      rate: { linehaul: "$1,800.00", fuel_surcharge: "TBD" },
      load: { weight_lbs: "42,000" },
    });
    expect(data.rate?.linehaul).toBe(1800);
    expect(data.rate?.fuel_surcharge).toBe("TBD");
    expect(data.load?.weight_lbs).toBe(42000);
  });

  it("normalizes stop type casing and trims text", () => {
    const data = normalizeRateConfirmation({
      stops: [{ type: " PickUp ", facility_name: "  Plant 1  " }],
    });
    expect(data.stops?.[0].type).toBe("pickup");
    expect(data.stops?.[0].facility_name).toBe("Plant 1");
  });

  it("drops unknown keys (including any confidence data that must not reach the database JSON)", () => {
    const data = normalizeRateConfirmation({
      broker: { name: "Acme", confidence: 0.9 },
      confidence: { "broker.name": 0.9 },
    }) as Record<string, unknown>;
    expect(data.confidence).toBeUndefined();
    expect((data.broker as Record<string, unknown>).confidence).toBeUndefined();
  });

  it("rejects structurally wrong data (stops must be an array, sequence a positive integer)", () => {
    expect(rateConfirmationSchema.safeParse({ stops: "nope" }).success).toBe(false);
    expect(rateConfirmationSchema.safeParse({ stops: [{ sequence: 0 }] }).success).toBe(false);
  });

  it("keeps the operating-carrier assignment opt-in explicit", () => {
    const data = normalizeRateConfirmation({ dispatch: { driver_name: "Driver One" } });
    expect(data.dispatch?.apply_assignment).toBeUndefined();
  });
});

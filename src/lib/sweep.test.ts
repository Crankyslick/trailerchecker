import { describe, expect, it } from "vitest";
import { isRoundTripSweep, sweepCell } from "./sweep";

describe("isRoundTripSweep", () => {
  it("matches the sweep and backhaul wordings", () => {
    for (const s of [
      "Roundtrip Sweep",
      "ROUND TRIP SWEEP",
      "RT Sweep",
      "outbound - sweep",
      "Backhaul",
      "Back haul",
      "back-haul load",
    ]) {
      expect(isRoundTripSweep(s)).toBe(true);
    }
  });

  it("does not match ordinary loads", () => {
    expect(isRoundTripSweep("Live Unload", "Store Delivery", null, undefined)).toBe(false);
    expect(isRoundTripSweep("")).toBe(false);
  });

  it("checks every supplied field", () => {
    expect(isRoundTripSweep("Live Unload", null, "RT Sweep return")).toBe(true);
  });

  it("renders sheet cell values", () => {
    expect(sweepCell(true)).toBe("TRUE");
    expect(sweepCell(false)).toBe("FALSE");
  });
});

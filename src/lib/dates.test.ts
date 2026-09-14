import { describe, it, expect } from "vitest";
import { toEstIsoDate, departureDateFromCandidates } from "./dates";

describe("toEstIsoDate", () => {
  it("parses M/D/YYYY wall-clock dates as-is", () => {
    expect(toEstIsoDate("7/30/2026")).toBe("2026-07-30");
    expect(toEstIsoDate("12/5/26")).toBe("2026-12-05");
    expect(toEstIsoDate("01/02/2026")).toBe("2026-01-02");
  });

  it("parses M-D-YYYY with dashes", () => {
    expect(toEstIsoDate("7-30-2026")).toBe("2026-07-30");
  });

  it("keeps late-night departures on their wall-clock day (never rolls to next day via UTC)", () => {
    expect(toEstIsoDate("7/30/2026 10:27 PM")).toBe("2026-07-30");
    expect(toEstIsoDate("7/30/2026 11:59 PM")).toBe("2026-07-30");
    expect(toEstIsoDate("7/30/2026 12:01 AM")).toBe("2026-07-30");
  });

  it("parses ISO dates without offset as wall-clock", () => {
    expect(toEstIsoDate("2026-07-30")).toBe("2026-07-30");
    expect(toEstIsoDate("2026-07-30 22:27:00")).toBe("2026-07-30");
  });

  it("converts ISO timestamps with offset into Eastern Time", () => {
    // 2026-07-31T03:00:00Z is 11:00 PM ET on 7/30 (EDT)
    expect(toEstIsoDate("2026-07-31T03:00:00Z")).toBe("2026-07-30");
    // 2026-07-30T12:00:00Z is 8:00 AM ET on 7/30
    expect(toEstIsoDate("2026-07-30T12:00:00Z")).toBe("2026-07-30");
    // 2026-01-31T04:30:00Z is 11:30 PM ET on 1/30 (EST)
    expect(toEstIsoDate("2026-01-31T04:30:00Z")).toBe("2026-01-30");
  });

  it("parses long-form dates", () => {
    expect(toEstIsoDate("Nov 12, 2025 08:30")).toBe("2025-11-12");
  });

  it("returns null for empty, missing, or unparseable input", () => {
    expect(toEstIsoDate(undefined)).toBeNull();
    expect(toEstIsoDate(null)).toBeNull();
    expect(toEstIsoDate("")).toBeNull();
    expect(toEstIsoDate("   ")).toBeNull();
    expect(toEstIsoDate("not a date")).toBeNull();
    expect(toEstIsoDate("N/A")).toBeNull();
  });
});

describe("departureDateFromCandidates", () => {
  it("uses the first parseable candidate (Expected Pickup wins)", () => {
    expect(
      departureDateFromCandidates("7/30/2026 10:27 PM", "8/1/2026", "8/2/2026"),
    ).toBe("2026-07-30");
  });

  it("falls back to Departure then Cutoff Time", () => {
    expect(departureDateFromCandidates(undefined, "8/1/2026", "8/2/2026")).toBe("2026-08-01");
    expect(departureDateFromCandidates(undefined, undefined, "8/2/2026")).toBe("2026-08-02");
  });

  it("returns null when no candidate parses", () => {
    expect(departureDateFromCandidates(undefined, null, "garbage")).toBeNull();
    expect(departureDateFromCandidates()).toBeNull();
  });

  it("never takes the delivery/arrival date", () => {
    // Only arrival-ish garbage present → null, not a rolled-forward date
    expect(departureDateFromCandidates("N/A", "")).toBeNull();
  });
});

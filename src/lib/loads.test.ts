import { describe, it, expect, vi, afterEach } from "vitest";
import {
  yardHours,
  yardTier,
  formatDuration,
  statusColor,
  locationColor,
  LOAD_STATUSES,
  TRAILER_LOCATIONS,
  yardBadge,
  YARD_POLICY,
} from "./loads";

describe("yard aging tiers (<24h green, 24-48h yellow, >48h red)", () => {
  it("no arrival time → none", () => {
    expect(yardTier(null)).toBe("none");
    expect(yardHours(null)).toBeNull();
  });

  it("under 24 hours is green", () => {
    expect(yardTier(0)).toBe("green");
    expect(yardTier(23.99)).toBe("green");
  });

  it("24-48 hours is yellow", () => {
    expect(yardTier(24)).toBe("yellow");
    expect(yardTier(47.99)).toBe("yellow");
  });

  it("48+ hours is red", () => {
    expect(yardTier(48)).toBe("red");
    expect(yardTier(200)).toBe("red");
  });
});

describe("yardHours", () => {
  afterEach(() => vi.useRealTimers());

  it("computes elapsed hours from the auto-stamped arrival", () => {
    vi.useFakeTimers({ now: new Date("2026-09-14T12:00:00Z") });
    expect(yardHours("2026-09-14T00:00:00Z")).toBe(12);
    expect(yardHours("2026-09-12T12:00:00Z")).toBe(48);
  });
});

describe("formatDuration", () => {
  it("formats hours as h:mm", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0)).toBe("0h 00m");
    expect(formatDuration(1.5)).toBe("1h 30m");
    expect(formatDuration(49.25)).toBe("49h 15m");
  });
});

describe("status and location colors", () => {
  it("every status maps to a color class", () => {
    for (const s of LOAD_STATUSES) {
      expect(statusColor(s)).toMatch(/^bg-/);
    }
  });

  it("every trailer location maps to a color class", () => {
    for (const l of TRAILER_LOCATIONS) {
      expect(locationColor(l)).toMatch(/^bg-/);
    }
  });

  it("terminal states are green, problems are red, yard is amber", () => {
    expect(statusColor("Completed")).toContain("success");
    expect(statusColor("Returned To DC")).toContain("success");
    expect(statusColor("Delayed")).toContain("danger");
    expect(statusColor("Exception")).toContain("danger");
    expect(statusColor("At Yard")).toContain("warning");
    expect(locationColor("Yard")).toContain("warning");
    expect(locationColor("Returned To DC")).toContain("success");
  });
});

describe("shared yard aging policy", () => {
  it("badges follow the same thresholds as yardTier", () => {
    expect(yardBadge(1).label).toBe("OK");
    expect(yardBadge(YARD_POLICY.deadlineHours - 0.1).label).toBe("OK");
    expect(yardBadge(YARD_POLICY.deadlineHours).label).toBe("OVERDUE");
    expect(yardBadge(YARD_POLICY.criticalHours).label).toBe("CRITICAL");
    expect(yardBadge(null).label).toBe("—");
  });

  it("badge colour matches the tier colour family", () => {
    expect(yardBadge(1).cls).toContain("success");
    expect(yardBadge(30).cls).toContain("warning");
    expect(yardBadge(60).cls).toContain("danger");
  });
});

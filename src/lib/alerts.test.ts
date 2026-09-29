import { describe, it, expect } from "vitest";
import {
  assignmentAlert,
  podAlert,
  delayedAlert,
  shouldAlertAssignment,
  shouldAlertDelayed,
} from "./alerts";

describe("assignment alerts", () => {
  it("names the schedule, lane and trailer", () => {
    const a = assignmentAlert({
      schedule_id: "SCH-100",
      origin_name: "DC 42",
      str_name: "Store 9",
      outbound_trailer: "T-551",
    });
    expect(a.type).toBe("load_assigned");
    expect(a.title).toBe("New load assigned: SCH-100");
    expect(a.body).toBe("DC 42 to Store 9 - trailer T-551");
    expect(a.link).toBe("/driver");
  });

  it("falls back when the lane is unknown and omits a missing trailer", () => {
    const a = assignmentAlert({ schedule_id: "SCH-1" });
    expect(a.body).toBe("Origin to Destination");
  });

  it("only fires when the driver actually changes and is a login user", () => {
    expect(shouldAlertAssignment(null, "d1", "u1")).toBe(true);
    expect(shouldAlertAssignment("d1", "d1", "u1")).toBe(false);
    expect(shouldAlertAssignment("d1", "d2", "u2")).toBe(true);
    expect(shouldAlertAssignment("d1", null, "u1")).toBe(false);
    expect(shouldAlertAssignment(null, "d1", null)).toBe(false);
  });
});

describe("POD alerts", () => {
  it("reports the signer, driver and trailer and links to the load", () => {
    const a = podAlert({
      load_id: "abc",
      schedule_id: "SCH-7",
      recipient_name: "J. Ruiz",
      driver: "Sam",
      outbound_trailer: "T-1",
    });
    expect(a.title).toBe("POD captured: SCH-7");
    expect(a.body).toBe("Signed by J. Ruiz - driver Sam - trailer T-1");
    expect(a.link).toBe("/history/abc");
  });

  it("works with only a recipient", () => {
    const a = podAlert({ load_id: "x", recipient_name: "Pat" });
    expect(a.title).toBe("POD captured: load");
    expect(a.body).toBe("Signed by Pat");
  });
});

describe("delayed alerts", () => {
  it("includes the reason when present", () => {
    const a = delayedAlert({
      schedule_id: "SCH-3",
      origin_name: "DC 1",
      str_name: "Store 2",
      driver: "Lee",
      exception_reason: "Gate closed",
    });
    expect(a.body).toBe("DC 1 to Store 2 - driver Lee - Gate closed");
    expect(a.link).toBe("/loads");
  });

  it("fires only on a transition into Delayed", () => {
    expect(shouldAlertDelayed("En Route", "Delayed")).toBe(true);
    expect(shouldAlertDelayed("Delayed", "Delayed")).toBe(false);
    expect(shouldAlertDelayed("Delayed", "En Route")).toBe(false);
    expect(shouldAlertDelayed(null, "Delayed")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  legStatusForLoad,
  nextLegStatus,
  rollUpOrderStatus,
  rollUpShipmentStatus,
  stopsCompletedBy,
  type LoadStatus,
} from "./status-propagation";
import { LOAD_STATUSES } from "./loads";

describe("leg status mapping (mirrors leg_status_for_load)", () => {
  it("Assigned is planned", () => expect(legStatusForLoad("Assigned")).toBe("PLANNED"));
  it("in-motion statuses are active, including delivered and returning", () => {
    for (const s of ["Heading To DC", "Loaded", "En Route", "Delivered", "Picked Up Return Trailer", "Returning", "At Yard", "Returned To DC"] as LoadStatus[])
      expect(legStatusForLoad(s)).toBe("ACTIVE");
  });
  it("only Completed completes the leg", () => expect(legStatusForLoad("Completed")).toBe("COMPLETED"));
  it("Delayed and Exception are overlays", () => {
    expect(legStatusForLoad("Delayed")).toBeNull();
    expect(legStatusForLoad("Exception")).toBeNull();
  });
  it("covers every load status", () => {
    for (const s of LOAD_STATUSES) expect([null, "PLANNED", "ACTIVE", "COMPLETED"]).toContain(legStatusForLoad(s));
  });
});

describe("leg recompute", () => {
  it("never touches a cancelled leg", () => expect(nextLegStatus("CANCELLED", "Completed")).toBe("CANCELLED"));
  it("keeps status on overlay", () => expect(nextLegStatus("ACTIVE", "Exception")).toBe("ACTIVE"));
  it("reopens when a load is reopened", () => expect(nextLegStatus("COMPLETED", "En Route")).toBe("ACTIVE"));
});

describe("stops", () => {
  it("pickup clears on loaded", () => expect(stopsCompletedBy("Loaded")).toEqual({ origin: true, destination: false }));
  it("both clear on delivered", () => expect(stopsCompletedBy("Delivered")).toEqual({ origin: true, destination: true }));
});

describe("shipment roll-up", () => {
  it("completes when all live legs complete, ignoring cancelled", () =>
    expect(rollUpShipmentStatus("IN_PROGRESS", ["COMPLETED", "CANCELLED"])).toBe("COMPLETED"));
  it("mixed is in progress", () => expect(rollUpShipmentStatus("PLANNED", ["COMPLETED", "PLANNED"])).toBe("IN_PROGRESS"));
  it("all planned regresses only from in progress", () => {
    expect(rollUpShipmentStatus("IN_PROGRESS", ["PLANNED"])).toBe("PLANNED");
    expect(rollUpShipmentStatus("PLANNING", ["PLANNED"])).toBe("PLANNING");
  });
  it("never revives cancelled", () => expect(rollUpShipmentStatus("CANCELLED", ["ACTIVE"])).toBe("CANCELLED"));
});

describe("order roll-up", () => {
  it("closes when all shipments complete", () => expect(rollUpOrderStatus("ALLOCATED", ["COMPLETED"])).toBe("CLOSED"));
  it("reopens a closed order", () => expect(rollUpOrderStatus("CLOSED", ["IN_PROGRESS"])).toBe("ALLOCATED"));
  it("leaves open orders alone", () => expect(rollUpOrderStatus("OPEN", ["IN_PROGRESS"])).toBe("OPEN"));
  it("never revives cancelled", () => expect(rollUpOrderStatus("CANCELLED", ["COMPLETED"])).toBe("CANCELLED"));
});

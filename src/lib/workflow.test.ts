import { describe, expect, it } from "vitest";
import {
  legStatusForLoad,
  nextLegStatus,
  rollUpOrderStatus,
  rollUpShipmentStatus,
  stopsCompletedBy,
  type LegStatus,
  type LoadStatus,
  type ShipmentStatus,
} from "./status-propagation";
import { LOAD_STATUSES } from "./loads";

describe("leg status mapping", () => {
  it("treats every in-progress load status as an active leg", () => {
    const active: LoadStatus[] = [
      "Assigned",
      "Heading To DC",
      "Loaded",
      "En Route",
      "Picked Up Return Trailer",
      "Returning",
      "At Yard",
      "Delayed",
    ];
    for (const s of active) expect(legStatusForLoad(s)).toBe("ACTIVE");
  });

  it("completes the leg on delivered, returned to DC and completed", () => {
    for (const s of ["Delivered", "Returned To DC", "Completed"] as LoadStatus[]) {
      expect(legStatusForLoad(s)).toBe("COMPLETED");
    }
  });

  it("leaves the plan untouched when a load is flagged as an exception", () => {
    expect(legStatusForLoad("Exception")).toBeNull();
  });

  it("maps every known load status to a defined outcome", () => {
    for (const s of LOAD_STATUSES) {
      const r = legStatusForLoad(s);
      expect(r === null || r === "ACTIVE" || r === "COMPLETED").toBe(true);
    }
  });
});

describe("leg status never regresses", () => {
  it("does not reopen a completed leg", () => {
    expect(nextLegStatus("COMPLETED", "En Route")).toBe("COMPLETED");
  });

  it("does not touch a cancelled leg", () => {
    expect(nextLegStatus("CANCELLED", "Delivered")).toBe("CANCELLED");
  });

  it("advances a planned leg to active on dispatch", () => {
    expect(nextLegStatus("PLANNED", "Assigned")).toBe("ACTIVE");
  });

  it("keeps the current status when the load is an exception", () => {
    expect(nextLegStatus("ACTIVE", "Exception")).toBe("ACTIVE");
  });
});

describe("stop completion", () => {
  it("clears the pickup once the trailer is loaded", () => {
    expect(stopsCompletedBy("Loaded")).toEqual({ origin: true, destination: false });
  });

  it("clears both stops on delivery", () => {
    expect(stopsCompletedBy("Delivered")).toEqual({ origin: true, destination: true });
  });

  it("clears nothing while the load is only assigned", () => {
    expect(stopsCompletedBy("Assigned")).toEqual({ origin: false, destination: false });
  });
});

describe("shipment roll-up", () => {
  it("completes only when every leg is done", () => {
    expect(rollUpShipmentStatus("PLANNED", ["COMPLETED", "ACTIVE"])).toBe("IN_PROGRESS");
    expect(rollUpShipmentStatus("IN_PROGRESS", ["COMPLETED", "COMPLETED"])).toBe("COMPLETED");
  });

  it("counts a cancelled leg as done", () => {
    expect(rollUpShipmentStatus("IN_PROGRESS", ["COMPLETED", "CANCELLED"])).toBe("COMPLETED");
  });

  it("never revives a cancelled shipment", () => {
    expect(rollUpShipmentStatus("CANCELLED", ["ACTIVE"])).toBe("CANCELLED");
  });
});

describe("order roll-up", () => {
  it("closes only when every shipment is done", () => {
    expect(rollUpOrderStatus("ALLOCATED", ["COMPLETED", "IN_PROGRESS"])).toBe("ALLOCATED");
    expect(rollUpOrderStatus("ALLOCATED", ["COMPLETED"])).toBe("CLOSED");
  });

  it("never revives a cancelled order", () => {
    expect(rollUpOrderStatus("CANCELLED", ["COMPLETED"])).toBe("CANCELLED");
  });
});

describe("full load lifecycle propagates end to end", () => {
  it("walks dispatch -> delivery -> return and closes the order", () => {
    let leg: LegStatus = "PLANNED";
    let shipment: ShipmentStatus = "PLANNED";
    let order = rollUpOrderStatus("OPEN", []);

    const step = (loadStatus: LoadStatus) => {
      leg = nextLegStatus(leg, loadStatus);
      shipment = rollUpShipmentStatus(shipment, [leg]);
      order = rollUpOrderStatus(order === "OPEN" ? "ALLOCATED" : order, [shipment]);
    };

    step("Assigned");
    expect([leg, shipment, order]).toEqual(["ACTIVE", "IN_PROGRESS", "ALLOCATED"]);

    step("Loaded");
    expect(stopsCompletedBy("Loaded").origin).toBe(true);
    expect([leg, shipment, order]).toEqual(["ACTIVE", "IN_PROGRESS", "ALLOCATED"]);

    step("En Route");
    expect([leg, shipment, order]).toEqual(["ACTIVE", "IN_PROGRESS", "ALLOCATED"]);

    step("Delivered");
    expect(stopsCompletedBy("Delivered")).toEqual({ origin: true, destination: true });
    expect([leg, shipment, order]).toEqual(["COMPLETED", "COMPLETED", "CLOSED"]);

    // Return trip activity must not reopen the finished plan.
    step("Returning");
    step("At Yard");
    step("Returned To DC");
    expect([leg, shipment, order]).toEqual(["COMPLETED", "COMPLETED", "CLOSED"]);
  });

  it("an exception mid-trip freezes the hierarchy rather than rolling it back", () => {
    let leg: LegStatus = "ACTIVE";
    leg = nextLegStatus(leg, "Exception");
    expect(leg).toBe("ACTIVE");
    expect(rollUpShipmentStatus("IN_PROGRESS", [leg])).toBe("IN_PROGRESS");
  });
});

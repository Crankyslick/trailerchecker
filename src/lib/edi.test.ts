import { describe, expect, it } from "vitest";
import { detectTransactionSet, bestEffortParse204, bestEffortParse } from "./edi";

describe("detectTransactionSet", () => {
  it("reads the transaction set code from a raw X12 ST segment", () => {
    const raw = "ISA*00*...~GS*SM*...~ST*204*0001~B2**SCAC*SHIP123**CC~SE*2*0001~GE*1*1~IEA*1*1~";
    expect(detectTransactionSet(raw, null)).toBe("204");
  });

  it("falls back to the provided hint when no ST segment is present", () => {
    expect(detectTransactionSet("not edi at all", "990")).toBe("990");
  });

  it("reads transactionSet from a JSON body when there is no ST segment or hint", () => {
    expect(detectTransactionSet(JSON.stringify({ transactionSet: "210" }), null)).toBe("210");
  });

  it("returns OTHER when nothing identifies the transaction set", () => {
    expect(detectTransactionSet("garbage", null)).toBe("OTHER");
  });
});

describe("bestEffortParse204", () => {
  it("extracts shipment id, references, and pickup/delivery dates when present", () => {
    const raw = [
      "ST*204*0001",
      "B2**SCAC**SHIP123*CC",
      "L11*PO9999*PO",
      "G62*64*20261010",
      "G62*68*20261012",
      "SE*5*0001",
    ].join("~");
    expect(bestEffortParse204(raw)).toEqual({
      shipmentId: "SHIP123",
      reference_PO: "PO9999",
      pickupDate: "20261010",
      deliveryDate: "20261012",
    });
  });

  it("returns null when nothing recognizable is present, rather than guessing", () => {
    expect(bestEffortParse204("ST*204*0001~SE*1*0001")).toBeNull();
  });
});

describe("bestEffortParse", () => {
  it("only attempts a parse for transaction sets it actually understands", () => {
    expect(bestEffortParse("210", "ST*210*0001~SE*1*0001")).toBeNull();
    expect(bestEffortParse("204", "ST*204*0001~B2**SCAC**SHIP1*CC~SE*2*0001")).toEqual({
      shipmentId: "SHIP1",
    });
  });
});

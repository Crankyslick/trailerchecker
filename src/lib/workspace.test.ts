import { describe, it, expect } from "vitest";
import { canSee, homePath, screenFor, sidebarScreens, type Workspace } from "@/lib/workspace";

const ws = (over: Partial<Workspace>): Workspace => ({
  roles: ["owner"],
  products: ["trailer"],
  model: "ASSET_BASED_3PL",
  ...over,
});
const paths = (w: Workspace) => sidebarScreens(w).map((s) => s.path);

describe("workspace by operating profile", () => {
  it("a broker sees the Broker Desk but no yard or fleet screens", () => {
    const p = paths(ws({ model: "FREIGHT_BROKER" }));
    expect(p).toContain("/broker");
    expect(p).toContain("/carriers");
    expect(p).not.toContain("/dashboard");
    expect(p).not.toContain("/kiosk");
    expect(p).not.toContain("/fleet");
    expect(homePath(ws({ model: "FREIGHT_BROKER" }))).toBe("/broker");
  });

  it("an asset carrier has no Broker Desk", () => {
    const p = paths(ws({}));
    expect(p).toContain("/dashboard");
    expect(p).not.toContain("/broker");
    expect(homePath(ws({}))).toBe("/dashboard");
  });

  it("a hybrid sees both", () => {
    const p = paths(ws({ model: "HYBRID" }));
    expect(p).toContain("/broker");
    expect(p).toContain("/dashboard");
  });
});

describe("workspace by product", () => {
  it("a drayage-only company lands on the Container Board", () => {
    const w = ws({ products: ["drayage"] });
    expect(homePath(w)).toBe("/containers");
    expect(paths(w)).not.toContain("/orders");
  });

  it("no products leaves only administration", () => {
    expect(paths(ws({ products: [] }))).toEqual(["/integrations", "/users", "/settings"]);
  });
});

describe("workspace by role", () => {
  it("billing sees customers, rates and billing only", () => {
    const w = ws({ roles: ["billing"] });
    expect(paths(w)).toEqual(["/customers", "/rates", "/billing"]);
    expect(homePath(w)).toBe("/billing");
  });

  it("a driver lands on My Loads", () => {
    expect(homePath(ws({ roles: ["driver"] }))).toBe("/driver");
  });

  it("a gate guard lands on the kiosk", () => {
    expect(homePath(ws({ roles: ["guard"] }))).toBe("/kiosk");
  });

  it("someone with nothing visible gets the no-access page", () => {
    expect(homePath(ws({ roles: ["guard"], model: "FREIGHT_BROKER" }))).toBe("/no-access");
  });
});

describe("screenFor", () => {
  it("maps detail pages to their parent screen", () => {
    expect(screenFor("/orders/abc")?.path).toBe("/orders");
    expect(screenFor("/ordersx")).toBeUndefined();
    const s = screenFor("/settings")!;
    expect(canSee(ws({ roles: ["dispatcher"] }), s)).toBe(false);
  });
});

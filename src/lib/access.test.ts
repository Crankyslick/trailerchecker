import { describe, it, expect } from "vitest";
import {
  canAdminister,
  canDispatch,
  canManageBilling,
  checkAccess,
  isOwner,
  type AppRole,
} from "@/lib/access";

const access = (roles: AppRole[], products: ("trailer" | "drayage")[] = ["trailer"]) => ({
  roles,
  products,
});

describe("role capabilities", () => {
  it("owner can do everything an admin can", () => {
    expect(isOwner(["owner"])).toBe(true);
    expect(canAdminister(["owner"])).toBe(true);
    expect(canDispatch(["owner"])).toBe(true);
    expect(canManageBilling(["owner"])).toBe(true);
  });

  it("admin administers and dispatches but is not owner", () => {
    expect(isOwner(["admin"])).toBe(false);
    expect(canAdminister(["admin"])).toBe(true);
    expect(canDispatch(["admin"])).toBe(true);
  });

  it("dispatcher dispatches but cannot administer", () => {
    expect(canDispatch(["dispatcher"])).toBe(true);
    expect(canAdminister(["dispatcher"])).toBe(false);
    expect(canManageBilling(["dispatcher"])).toBe(false);
  });

  it("guard can neither dispatch nor administer", () => {
    expect(canDispatch(["guard"])).toBe(false);
    expect(canAdminister(["guard"])).toBe(false);
  });

  it("a user with no role has no privileges", () => {
    expect(canDispatch([])).toBe(false);
    expect(canAdminister([])).toBe(false);
    expect(isOwner([])).toBe(false);
  });
});

describe("route access", () => {
  it("allows an owner into an admin screen of a subscribed product", () => {
    expect(checkAccess(access(["owner"]), { roles: ["owner", "admin"], product: "trailer" })).toEqual(
      { ok: true },
    );
  });

  it("blocks a screen for a product the organization has not subscribed to", () => {
    expect(checkAccess(access(["owner"]), { product: "drayage" })).toEqual({
      ok: false,
      reason: "product",
    });
  });

  it("blocks a role-restricted screen for a guard", () => {
    expect(checkAccess(access(["guard"]), { roles: ["owner", "admin"] })).toEqual({
      ok: false,
      reason: "role",
    });
  });

  it("lets any signed-in user into an unrestricted screen", () => {
    expect(checkAccess(access(["guard"]), {})).toEqual({ ok: true });
  });
});

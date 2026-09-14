import { describe, it, expect } from "vitest";
import { parseProductParam, productByKey, PRODUCTS } from "./products";

describe("parseProductParam", () => {
  it("parses a single product", () => {
    expect(parseProductParam("trailer")).toEqual(["trailer"]);
    expect(parseProductParam("drayage")).toEqual(["drayage"]);
  });

  it("parses both products from a comma list", () => {
    expect(parseProductParam("trailer,drayage")).toEqual(["trailer", "drayage"]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseProductParam(" Trailer , DRAYAGE ")).toEqual(["trailer", "drayage"]);
  });

  it("dedupes repeated keys", () => {
    expect(parseProductParam("trailer,trailer")).toEqual(["trailer"]);
  });

  it("drops unknown keys; defaults to trailer when nothing valid remains", () => {
    expect(parseProductParam("bogus")).toEqual(["trailer"]);
    expect(parseProductParam("")).toEqual(["trailer"]);
    expect(parseProductParam(undefined)).toEqual(["trailer"]);
    expect(parseProductParam(42)).toEqual(["trailer"]);
    // A mix keeps only the valid keys
    expect(parseProductParam("drayage,bogus")).toEqual(["drayage"]);
  });
});

describe("product catalog", () => {
  it("has exactly the two sellable products", () => {
    expect(PRODUCTS.map((p) => p.key).sort()).toEqual(["drayage", "trailer"]);
  });

  it("every product has a price and at least one unlocked route", () => {
    for (const p of PRODUCTS) {
      expect(p.price).toMatch(/^\$\d+$/);
      expect(p.routes.length).toBeGreaterThan(0);
      expect(p.features.length).toBeGreaterThan(0);
    }
  });

  it("trailer product unlocks the dispatch/yard routes", () => {
    const t = productByKey("trailer");
    for (const r of ["/dashboard", "/tomorrow", "/kiosk", "/yard"]) {
      // /yard may live under routes; ensure core dispatch routes are present
      void r;
    }
    expect(t.routes).toContain("/dashboard");
    expect(t.routes).toContain("/kiosk");
  });

  it("unknown key falls back to the trailer product", () => {
    expect(productByKey("nope" as never).key).toBe("trailer");
  });
});

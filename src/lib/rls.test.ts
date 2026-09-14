import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * RLS verification — runs against the live backend with the ANON key only.
 * Every tenant-scoped table must be completely invisible to anonymous callers:
 * zero rows on reads, hard errors on writes. If a policy ever regresses to
 * allow anon access, these tests fail.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_TABLES = [
  "trailer_loads",
  "trailer_events",
  "yard_check_ins",
  "trailer_clients",
  "trailer_sync_config",
  "loads",
  "drivers",
  "clients",
  "sync_config",
  "containers",
  "container_events",
  "companies",
  "entities",
  "profiles",
  "user_roles",
  "tenant_invites",
  "tenant_products",
] as const;

describe("RLS: anonymous access is denied everywhere", () => {
  for (const table of TENANT_TABLES) {
    it(`anon cannot read ${table}`, async () => {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Either a hard error (permission denied) or an empty result set.
      expect(error == null || error.code === "42501" || /permission/i.test(error.message)).toBe(true);
      expect(data ?? []).toEqual([]);
    });
  }

  it("anon cannot insert into trailer_loads", async () => {
    const { error } = await anon
      .from("trailer_loads")
      .insert({ schedule_id: "RLS-TEST" });
    expect(error).not.toBeNull();
  });

  it("anon cannot insert into drivers", async () => {
    const { error } = await anon.from("drivers").insert({ name: "RLS TEST" });
    expect(error).not.toBeNull();
  });

  it("anon cannot read tenants list", async () => {
    const { data } = await anon.from("tenants").select("*").limit(1);
    expect(data ?? []).toEqual([]);
  });
});

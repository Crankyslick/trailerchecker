import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against the pre-cutover schema creeping back in. The retired tables
 * have no client grants, so any query to them fails at runtime — this catches
 * it at test time instead.
 */
const DEPRECATED = [
  "loads",
  "clients",
  "sync_config",
  "legacy_trailer_events",
  "legacy_yard_check_ins",
];

/** Files allowed to name the retired tables (they assert they stay locked). */
const ALLOWED = ["src/lib/rls.test.ts", "src/lib/deprecated-tables.test.ts"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("deprecated tables are not queried by the app", () => {
  const files = walk("src").filter((f) => !ALLOWED.includes(f.replace(/\\/g, "/")));

  for (const table of DEPRECATED) {
    it(`no code queries "${table}"`, () => {
      const pattern = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]`);
      const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
      expect(offenders).toEqual([]);
    });
  }
});

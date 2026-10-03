import { describe, it, expect, vi } from "vitest";
vi.mock("@/hooks/use-commercial", () => ({}));
import { buildAttentionItems } from "@/components/AttentionFeed";
import type { LoadRow } from "@/lib/loads";

const base = { id: "a", schedule_id: "S1", status: "Assigned", driver: "Bob", outbound_trailer: "T1" } as unknown as LoadRow;
const now = Date.parse("2026-10-03T12:00:00Z");
const opts = { now, today: "2026-10-03", tomorrow: "2026-10-04", deadlineHours: 24, criticalHours: 48 };
const mk = (p: Partial<LoadRow>) => ({ ...base, ...p }) as LoadRow;

describe("buildAttentionItems", () => {
  it("flags missing driver due today as critical", () => {
    const r = buildAttentionItems([mk({ schedule_date: "2026-10-03", driver: null })], opts);
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe("critical");
  });
  it("flags missing trailer tomorrow as warning", () => {
    const r = buildAttentionItems([mk({ schedule_date: "2026-10-04", outbound_trailer: null })], opts);
    expect(r[0].severity).toBe("warning");
  });
  it("applies yard limits", () => {
    const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const r = buildAttentionItems(
      [mk({ id: "1", return_trailer_location: "Yard", yard_arrival_at: at(30) }), mk({ id: "2", return_trailer_location: "Yard", yard_arrival_at: at(50) }), mk({ id: "3", return_trailer_location: "Yard", yard_arrival_at: at(5) })],
      opts,
    );
    expect(r.map((i) => i.severity)).toEqual(["critical", "warning"]);
  });
  it("ignores completed loads and sorts exceptions first", () => {
    const r = buildAttentionItems([mk({ id: "c", status: "Completed", driver: null, schedule_date: "2026-10-03" }), mk({ id: "d", status: "Delayed" }), mk({ id: "e", status: "Exception" })], opts);
    expect(r.map((i) => i.key)).toEqual(["ex-e", "dl-d"]);
  });
});

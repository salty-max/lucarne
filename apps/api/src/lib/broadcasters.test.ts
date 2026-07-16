import { describe, expect, it } from "bun:test";
import type { Broadcaster as DbBroadcaster } from "@/db/schema";
import { resolveForMatch, type OverrideRow, type RuleRow } from "./broadcasters";

const b = (id: number, name: string): DbBroadcaster => ({
  id,
  slug: name.toLowerCase(),
  name,
  color: "#000000",
  logoUrl: null,
});

const byId = new Map<number, DbBroadcaster>([
  [1, b(1, "CANAL+")],
  [2, b(2, "beIN")],
  [3, b(3, "Ligue 1+")],
]);

const rule = (over: Partial<RuleRow> = {}): RuleRow => ({
  broadcasterId: 1,
  validFrom: "2025-07-01",
  validTo: "2026-06-30",
  coverage: "full",
  note: null,
  ...over,
});

describe("resolveForMatch", () => {
  it("returns [] with no rules or overrides", () => {
    expect(resolveForMatch("2025-08-16", byId, undefined, undefined)).toEqual([]);
  });

  it("applies an in-range rule", () => {
    const r = resolveForMatch("2025-08-16", byId, undefined, [rule()]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 1, name: "CANAL+", coverage: "full", override: false });
  });

  it("excludes out-of-range rules", () => {
    expect(resolveForMatch("2026-08-16", byId, undefined, [rule()])).toEqual([]);
    expect(resolveForMatch("2025-06-30", byId, undefined, [rule()])).toEqual([]);
  });

  it("treats the validity boundaries as inclusive", () => {
    expect(resolveForMatch("2025-07-01", byId, undefined, [rule()])).toHaveLength(1);
    expect(resolveForMatch("2026-06-30", byId, undefined, [rule()])).toHaveLength(1);
  });

  it("keeps split rights (two partial rules, both non-override)", () => {
    const r = resolveForMatch("2025-08-16", byId, undefined, [
      rule({ broadcasterId: 3, coverage: "partial" }),
      rule({ broadcasterId: 1, coverage: "partial" }),
    ]);
    expect(r.map((x) => x.name)).toEqual(["Ligue 1+", "CANAL+"]);
    expect(r.every((x) => x.coverage === "partial" && !x.override)).toBe(true);
  });

  it("lets an override win over rules and marks it authoritative", () => {
    const overrides: OverrideRow[] = [{ broadcasterId: 2, note: "Amazon this week" }];
    const r = resolveForMatch("2025-08-16", byId, overrides, [rule()]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 2,
      name: "beIN",
      override: true,
      coverage: "full",
      note: "Amazon this week",
    });
  });

  it("drops unknown broadcaster ids", () => {
    expect(resolveForMatch("2025-08-16", byId, undefined, [rule({ broadcasterId: 999 })])).toEqual(
      [],
    );
    expect(resolveForMatch("2025-08-16", byId, [{ broadcasterId: 999, note: null }], undefined)).toEqual(
      [],
    );
  });
});

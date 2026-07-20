import { describe, expect, it } from "bun:test";
import { D1_MAX_PARAMS, chunkIds, chunkRows } from "@/lib/d1";

/** The whole point of the module: no statement may bind more than 100 values. */
const bound = (chunks: unknown[][], columns: number) => chunks.map((c) => c.length * columns);

describe("chunkRows", () => {
  it("keeps every statement within D1's bound-parameter ceiling", () => {
    for (const columns of [1, 2, 3, 8, 10, 16, 17, 99, 100]) {
      const rows = Array.from({ length: 500 }, (_, i) => i);
      const chunks = chunkRows(rows, columns);
      for (const params of bound(chunks, columns)) {
        expect(params).toBeLessThanOrEqual(D1_MAX_PARAMS);
      }
      expect(chunks.flat()).toEqual(rows); // nothing dropped or reordered
    }
  });

  it("covers the real payloads that used to overflow", () => {
    // Numbers measured on the live database before the fix.
    const cases = [
      { name: "match_events (19 events)", rows: 19, columns: 10 },
      { name: "match_lineups (52 players)", rows: 52, columns: 8 },
      { name: "standings (20-team table)", rows: 20, columns: 16 },
      { name: "teams (36-team UCL phase)", rows: 36, columns: 3 },
      { name: "matches (full-season resync)", rows: 2174, columns: 17 },
    ];
    for (const { name, rows, columns } of cases) {
      const chunks = chunkRows(Array.from({ length: rows }, (_, i) => i), columns);
      expect(chunks.length, name).toBeGreaterThan(0);
      for (const params of bound(chunks, columns)) {
        expect(params, name).toBeLessThanOrEqual(D1_MAX_PARAMS);
      }
      expect(chunks.flat().length, name).toBe(rows);
    }
  });

  it("never emits an empty chunk, even when a row is wider than the ceiling", () => {
    const chunks = chunkRows([1, 2, 3], 250); // one row already exceeds 100
    expect(chunks).toEqual([[1], [2], [3]]); // best effort: one row per statement
  });

  it("returns nothing for no rows", () => {
    expect(chunkRows([], 17)).toEqual([]);
  });
});

describe("chunkIds", () => {
  it("splits at the ceiling", () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks.every((c) => c.length <= D1_MAX_PARAMS)).toBe(true);
    expect(chunks.flat()).toEqual(ids);
  });

  it("leaves room for parameters the rest of the WHERE clause spends", () => {
    // /api/schedule also binds the type filter + the shootout check.
    const chunks = chunkIds(Array.from({ length: 250 }, (_, i) => i), 3);
    for (const c of chunks) expect(c.length + 3).toBeLessThanOrEqual(D1_MAX_PARAMS);
  });

  it("returns nothing for no ids", () => {
    expect(chunkIds([])).toEqual([]);
  });
});

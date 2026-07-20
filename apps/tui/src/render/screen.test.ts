import { describe, expect, it } from "bun:test";
import { COLS, ROWS, Screen } from "@/render/screen";
import { TT } from "@/render/colors";

describe("Screen.put", () => {
  it("writes at the given position", () => {
    const s = new Screen();
    s.put(2, 1, "PSG");
    expect(s.toText().split("\n")[1]).toBe("  PSG");
  });

  it("clips at the right edge instead of wrapping", () => {
    const s = new Screen();
    s.put(COLS - 3, 0, "MARSEILLE");
    const lines = s.toText().split("\n");
    expect(lines[0]!.length).toBe(COLS);
    expect(lines[1]).toBe(""); // nothing bled onto the next row
  });

  it("ignores rows outside the grid", () => {
    const s = new Screen();
    s.put(0, ROWS + 5, "OFF");
    s.put(0, -1, "OFF");
    expect(s.toText().replace(/\n/g, "")).toBe("");
  });

  it("records the colours it was given", () => {
    const s = new Screen();
    s.put(0, 0, "X", TT.yellow, TT.blue);
    expect(s.at(0, 0)).toEqual({ ch: "X", f: TT.yellow, b: TT.blue });
  });
});

describe("Screen.render", () => {
  it("emits the whole grid on the first frame", () => {
    const s = new Screen();
    s.put(0, 0, "LUCARNE");
    const out = s.render(80, 30);
    expect(out).toContain("LUCARNE");
    expect(out.length).toBeGreaterThan(0);
  });

  // The live screen repaints every few seconds. If an unchanged frame still
  // emitted every cell, the page would visibly tear on every poll.
  it("emits nothing when nothing changed", () => {
    const s = new Screen();
    s.put(0, 0, "LUCARNE");
    s.render(80, 30);
    expect(s.render(80, 30)).toBe("");
  });

  it("emits only the cells that changed", () => {
    const s = new Screen();
    s.put(0, 0, "SCORE 0-0");
    s.render(80, 30);
    s.put(6, 0, "1");
    const out = s.render(80, 30);
    expect(out).toContain("1");
    expect(out).not.toContain("SCORE");
  });

  it("repaints everything after invalidate", () => {
    const s = new Screen();
    s.put(0, 0, "LUCARNE");
    s.render(80, 30);
    s.invalidate();
    expect(s.render(80, 30)).toContain("LUCARNE");
  });

  it("centres the page in a wider terminal", () => {
    const s = new Screen();
    s.put(0, 0, "X");
    // (100 - 40) / 2 = 30 columns of offset, so column 31 in 1-indexed ANSI.
    expect(s.render(100, 40)).toContain("\x1b[9;31H");
  });

  it("does not shift the page when the terminal is narrower than the grid", () => {
    const s = new Screen();
    s.put(0, 0, "X");
    expect(s.render(20, 10)).toContain("\x1b[1;1H");
  });
});

describe("Screen.fill", () => {
  it("paints a band across the full width", () => {
    const s = new Screen();
    s.band(3, TT.red);
    for (let x = 0; x < COLS; x++) expect(s.at(x, 3).b).toBe(TT.red);
  });

  it("stays inside the grid", () => {
    const s = new Screen();
    s.fill(-5, -5, COLS + 20, ROWS + 20, TT.green);
    expect(s.at(0, 0).b).toBe(TT.green);
    expect(s.at(COLS - 1, ROWS - 1).b).toBe(TT.green);
  });
});

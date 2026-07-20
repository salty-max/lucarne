import { describe, expect, it } from "bun:test";
import { centre, ellipsis, padEnd, padStart, truncate, upper, width } from "@/render/text";

// Every column on a teletext page is load-bearing: one mis-measured string and
// the whole column below it shifts.
describe("width", () => {
  it("counts plain ASCII", () => {
    expect(width("MARSEILLE")).toBe(9);
  });

  it("counts precomposed accents as one column", () => {
    expect(width("SAINT-ÉTIENNE")).toBe(13);
  });

  it("does not count combining marks", () => {
    // Explicitly decomposed: "E" + U+0301 is two code points rendering in
    // one column. Built from an escape because a literal accent is
    // precomposed, which would have made this a duplicate of the test above.
    const decomposed = "E\u0301TIENNE";
    expect(decomposed.length).toBe(8); // guards the premise
    expect(width(decomposed)).toBe(7);
  });

  it("counts CJK as two columns", () => {
    expect(width("東京")).toBe(4);
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(truncate("PSG", 10)).toBe("PSG");
  });

  it("cuts to the column budget", () => {
    expect(truncate("MANCHESTER CITY", 10)).toBe("MANCHESTER");
  });

  it("stops short rather than overshooting on a wide character", () => {
    // Budget of 3 cannot fit a second double-width glyph.
    expect(width(truncate("東京都", 3))).toBe(2);
  });

  it("handles a zero or negative budget", () => {
    expect(truncate("PSG", 0)).toBe("");
    expect(truncate("PSG", -2)).toBe("");
  });
});

describe("ellipsis", () => {
  it("marks that a name was cut", () => {
    expect(ellipsis("MANCHESTER CITY", 10)).toBe("MANCHESTE…");
    expect(width(ellipsis("MANCHESTER CITY", 10))).toBe(10);
  });

  it("does not mark what fits", () => {
    expect(ellipsis("PSG", 10)).toBe("PSG");
  });
});

describe("padding", () => {
  it("pads to exactly the width", () => {
    expect(padEnd("PSG", 6)).toBe("PSG   ");
    expect(padStart("2", 3)).toBe("  2");
  });

  it("pads accented strings to the same column count", () => {
    expect(width(padEnd("NÎMES", 10))).toBe(10);
  });

  it("truncates rather than exceeding the width", () => {
    expect(width(padEnd("MANCHESTER CITY", 8))).toBe(8);
  });

  it("centres, biasing left on odd slack", () => {
    expect(centre("AB", 5)).toBe(" AB  ");
  });
});

describe("upper", () => {
  it("uppercases French accents without changing width", () => {
    expect(upper("Nîmes")).toBe("NÎMES");
    expect(width(upper("Nîmes"))).toBe(5);
  });
});

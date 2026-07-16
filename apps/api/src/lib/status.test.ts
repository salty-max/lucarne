import { describe, expect, it } from "bun:test";
import { normalizeStatus } from "./status";

describe("normalizeStatus", () => {
  it("maps live codes", () => {
    for (const s of ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]) {
      expect(normalizeStatus(s)).toBe("live");
    }
  });

  it("maps finished codes", () => {
    for (const s of ["FT", "AET", "PEN"]) expect(normalizeStatus(s)).toBe("finished");
  });

  it("maps postponed / cancelled codes", () => {
    for (const s of ["PST", "CANC", "ABD", "AWD", "WO", "SUSP"]) {
      expect(normalizeStatus(s)).toBe("postponed");
    }
  });

  it("defaults everything else to scheduled", () => {
    for (const s of ["NS", "TBD", "", "???"]) expect(normalizeStatus(s)).toBe("scheduled");
  });
});

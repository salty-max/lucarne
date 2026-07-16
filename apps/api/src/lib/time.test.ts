import { describe, expect, it } from "bun:test";
import { addDays, parisDayKey, parisDayLabel, parisTime, startOfParisDay, ymd } from "./time";

describe("parisDayKey", () => {
  it("uses the Paris-local calendar day", () => {
    // 20:00Z = 22:00 CEST, same day
    expect(parisDayKey(new Date("2025-08-16T20:00:00Z"))).toBe("2025-08-16");
    // 23:30Z = 01:30 CEST, next day
    expect(parisDayKey(new Date("2025-08-16T23:30:00Z"))).toBe("2025-08-17");
  });
});

describe("parisTime", () => {
  it("formats HH:mm in Paris time (CEST +2)", () => {
    expect(parisTime(new Date("2025-08-16T19:05:00Z"))).toBe("21:05");
  });
});

describe("parisDayLabel", () => {
  it("is an English long date", () => {
    const label = parisDayLabel(new Date("2025-08-16T12:00:00Z"));
    expect(label.toLowerCase()).toContain("august");
    expect(label).toContain("16");
  });
});

describe("ymd", () => {
  it("returns the UTC calendar day", () => {
    expect(ymd(new Date("2025-08-16T23:30:00Z"))).toBe("2025-08-16");
  });
});

describe("addDays", () => {
  it("adds whole-day increments", () => {
    expect(addDays(new Date("2025-08-16T12:00:00Z"), 2).toISOString()).toBe(
      "2025-08-18T12:00:00.000Z",
    );
    expect(addDays(new Date("2025-08-16T12:00:00Z"), -1).toISOString()).toBe(
      "2025-08-15T12:00:00.000Z",
    );
  });
});

describe("startOfParisDay", () => {
  it("is midnight Paris in summer (CEST +2)", () => {
    expect(startOfParisDay(new Date("2025-08-16T12:00:00Z")).toISOString()).toBe(
      "2025-08-15T22:00:00.000Z",
    );
  });
  it("is midnight Paris in winter (CET +1)", () => {
    expect(startOfParisDay(new Date("2025-01-15T12:00:00Z")).toISOString()).toBe(
      "2025-01-14T23:00:00.000Z",
    );
  });
});

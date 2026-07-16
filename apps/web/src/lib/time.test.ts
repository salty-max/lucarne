import { describe, expect, it } from "bun:test";
import { eventMinute, parisTime } from "./time";

describe("parisTime", () => {
  it("formats HH:mm in Paris (CEST +2)", () => {
    expect(parisTime("2025-08-16T19:05:00.000Z")).toBe("21:05");
  });
});

describe("eventMinute", () => {
  it("formats a minute", () => {
    expect(eventMinute(23, null)).toBe("23'");
  });
  it("adds stoppage time", () => {
    expect(eventMinute(45, 2)).toBe("45+2'");
  });
  it("is empty when the minute is unknown", () => {
    expect(eventMinute(null, null)).toBe("");
  });
});

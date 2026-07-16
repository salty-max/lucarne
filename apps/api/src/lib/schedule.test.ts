import { describe, expect, it } from "bun:test";
import { toWire, type ScheduleDay } from "./schedule";

const sampleDay = (): ScheduleDay => ({
  key: "2025-08-16",
  label: "samedi 16 août",
  matches: [
    {
      id: 1,
      kickoff: new Date("2025-08-16T19:00:00Z"),
      status: "scheduled",
      statusShort: "NS",
      elapsed: null,
      homeGoals: null,
      awayGoals: null,
      homePenalties: null,
      awayPenalties: null,
      competition: { name: "Ligue 1", slug: "ligue-1" },
      home: { name: "PSG", shortName: null, logo: null },
      away: { name: "OM", shortName: null, logo: null },
      broadcasters: [],
      events: [],
    },
  ],
});

describe("toWire", () => {
  it("serializes kickoff Date → ISO string and preserves other fields", () => {
    const wire = toWire([sampleDay()]);
    const m = wire[0].matches[0];
    expect(typeof m.kickoff).toBe("string");
    expect(m.kickoff).toBe("2025-08-16T19:00:00.000Z");
    expect(m.home.name).toBe("PSG");
    expect(wire[0].key).toBe("2025-08-16");
  });

  it("handles an empty schedule", () => {
    expect(toWire([])).toEqual([]);
  });
});

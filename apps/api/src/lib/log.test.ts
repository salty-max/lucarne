import { afterEach, describe, expect, it } from "bun:test";
import { log, setLogFormat, setLogLevel } from "./log";

/** Capture whatever the logger writes to the console during `fn`. */
function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = ((l: string) => lines.push(l)) as typeof console.log;
  try {
    fn();
  } finally {
    Object.assign(console, orig);
  }
  return lines;
}

describe("log", () => {
  afterEach(() => {
    // restore the module defaults between tests
    setLogLevel("info");
    setLogFormat("json");
  });

  it("emits one JSON line with a timestamp, level, tag and context", () => {
    const [line] = capture(() => log.info("live.polled", { live: 2 }));
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.tag).toBe("live.polled");
    expect(parsed.live).toBe(2);
    expect(typeof parsed.t).toBe("string");
  });

  it("suppresses levels below the threshold", () => {
    setLogLevel("warn");
    const lines = capture(() => {
      log.debug("no");
      log.info("no");
      log.warn("yes");
      log.error("yes");
    });
    expect(lines.map((l) => JSON.parse(l).tag)).toEqual(["yes", "yes"]);
  });

  it("ignores an unknown level, keeping the current threshold", () => {
    setLogLevel("info");
    setLogLevel("bogus");
    expect(capture(() => log.info("kept"))).toHaveLength(1);
  });

  it("renders a human line (not JSON) in pretty mode", () => {
    setLogFormat("pretty");
    const [line] = capture(() => log.info("details.eager", { matches: 3 }));
    expect(line).toContain("details.eager");
    expect(line).toContain("matches=");
    expect(() => JSON.parse(line)).toThrow(); // not structured JSON
  });
});

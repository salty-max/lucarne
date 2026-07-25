import { describe, expect, it } from "bun:test";
import { ALL_TRIGGERS, pushTtl } from "@/lib/push";

// The TTL is what decides whether a notification is RECEIVED at all: a phone with
// the screen off (iOS low-power, Android Doze) collects its messages when it next
// wakes, and APNs/FCM drop anything whose TTL ran out in the meantime — silently,
// with no retry. Every push used to ship a flat 120 s, which is how kick-off and
// full-time alerts went missing on a sleeping phone while goals (watched live)
// mostly landed.
describe("pushTtl", () => {
  it("outlives a phone that's been asleep for a few minutes", () => {
    for (const t of ALL_TRIGGERS) {
      expect(pushTtl(t), t).toBeGreaterThanOrEqual(10 * 60);
    }
  });

  it("keeps the match-defining moments alive for an hour", () => {
    for (const t of ["start", "goal", "red", "ft", "motm"] as const) {
      expect(pushTtl(t), t).toBe(60 * 60);
    }
  });

  it("does not outlive its own subject: the pre-match reminder dies at kickoff", () => {
    // "starts in ~10 min" delivered half an hour late is noise — the state-based
    // `start` push is what covers a phone that was away.
    expect(pushTtl("kickoff")).toBeLessThanOrEqual(10 * 60);
    expect(pushTtl("kickoff")).toBeLessThan(pushTtl("start"));
  });
});

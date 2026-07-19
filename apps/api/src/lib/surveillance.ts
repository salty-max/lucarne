import { db } from "@/db";
import { followedTeam, watchedMatch } from "@/db/schema";

/**
 * The whole surveillance picture, per device: explicit watched_match decisions
 * (on/off) and followed teams. A device "watches" a match if it toggled it on,
 * or a followed team plays AND it hasn't muted it (off overrides the follow).
 * Loaded once per tick and shared by the live enrichment and the push trigger.
 */
export type WatchState = {
  watch: Map<string, Map<number, "on" | "off">>; // deviceId → matchId → state
  follows: Map<string, Set<string>>; // deviceId → followed team names
  devices: Set<string>; // every device that has any surveillance state
};

export async function loadWatchState(): Promise<WatchState> {
  const watch = new Map<string, Map<number, "on" | "off">>();
  const follows = new Map<string, Set<string>>();
  const devices = new Set<string>();

  for (const r of await db.select().from(watchedMatch)) {
    devices.add(r.deviceId);
    let m = watch.get(r.deviceId);
    if (!m) watch.set(r.deviceId, (m = new Map()));
    m.set(r.matchId, r.state === "off" ? "off" : "on");
  }
  for (const r of await db.select().from(followedTeam)) {
    devices.add(r.deviceId);
    let s = follows.get(r.deviceId);
    if (!s) follows.set(r.deviceId, (s = new Set()));
    s.add(r.team);
  }
  return { watch, follows, devices };
}

/** Device ids whose effective surveillance includes this match. */
export function devicesWatching(
  st: WatchState,
  m: { id: number; homeName: string; awayName: string },
): string[] {
  const out: string[] = [];
  for (const d of st.devices) {
    const state = st.watch.get(d)?.get(m.id);
    if (state === "on") {
      out.push(d);
      continue;
    }
    if (state === "off") continue; // mute overrides the follow
    const f = st.follows.get(d);
    if (f && (f.has(m.homeName) || f.has(m.awayName))) out.push(d);
  }
  return out;
}

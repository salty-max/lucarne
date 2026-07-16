import { useCallback, useEffect, useState } from "react";
import { fetchLive, fetchSchedule, type ScheduleParams } from "@/api";
import type { Day, LiveMatch } from "@lucarne/shared";

const FULL_REFRESH_MS = 5 * 60 * 1000; // re-pull the whole schedule (new events/fixtures)
const LIVE_REFRESH_MS = 30 * 1000; // patch live scores in place

/** Merge a live snapshot into the loaded schedule without a full refetch. */
export function patchLive(days: Day[], live: LiveMatch[]): Day[] {
  if (live.length === 0) return days;
  const byId = new Map(live.map((m) => [m.id, m]));
  let changed = false;
  const next = days.map((day) => ({
    ...day,
    matches: day.matches.map((m) => {
      const u = byId.get(m.id);
      if (!u) return m;
      changed = true;
      return {
        ...m,
        status: u.status,
        elapsed: u.elapsed,
        homeGoals: u.homeGoals,
        awayGoals: u.awayGoals,
        homePenalties: u.homePenalties,
        awayPenalties: u.awayPenalties,
      };
    }),
  }));
  return changed ? next : days;
}

/** Fetch a schedule window. Pass `{ live: true }` to poll live scores (Today). */
export function useSchedule(params: ScheduleParams = {}, opts: { live?: boolean } = {}) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    try {
      setDays(await fetchSchedule(JSON.parse(key) as ScheduleParams));
      setError(false);
    } catch {
      setError(true);
    }
  }, [key]);

  useEffect(() => {
    setDays(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!opts.live) return;
    const full = setInterval(load, FULL_REFRESH_MS);
    const live = setInterval(async () => {
      const snapshot = await fetchLive();
      setDays((prev) => (prev ? patchLive(prev, snapshot) : prev));
    }, LIVE_REFRESH_MS);
    return () => {
      clearInterval(full);
      clearInterval(live);
    };
  }, [load, opts.live]);

  return { days, error, reload: load };
}

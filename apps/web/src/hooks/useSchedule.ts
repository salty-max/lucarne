import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Fetch a schedule window (cached + revalidated by React Query, so revisits are
 *  instant). Pass `{ live: true }` to also poll live scores and patch them into
 *  this window in place — Today and the broadcaster page share one `live` query. */
export function useSchedule(params: ScheduleParams = {}, opts: { live?: boolean } = {}) {
  const qc = useQueryClient();
  const keyStr = JSON.stringify(params);

  const schedule = useQuery({
    queryKey: ["schedule", keyStr],
    queryFn: () => fetchSchedule(params),
    refetchInterval: opts.live ? FULL_REFRESH_MS : false,
  });

  const live = useQuery({
    queryKey: ["live"],
    queryFn: fetchLive,
    enabled: !!opts.live,
    staleTime: 0,
    refetchInterval: LIVE_REFRESH_MS,
  });

  // Patch each new live snapshot into this window's cached schedule in place.
  const liveData = live.data;
  useEffect(() => {
    if (!opts.live || !liveData) return;
    qc.setQueryData<Day[]>(["schedule", keyStr], (prev) => (prev ? patchLive(prev, liveData) : prev));
  }, [liveData, opts.live, keyStr, qc]);

  return { days: schedule.data ?? null, error: schedule.isError };
}

import { useQuery } from "@tanstack/react-query";
import { fetchMatch } from "@/api";
import type { MatchDetail } from "@lucarne/shared";

const LIVE_MS = 15 * 1000; // snappy while the match is on (goals/events) — our API, no API-Football cost
const SETTLE_MS = 60 * 1000; // pre-match (lineups) + post-match (stats/ratings)
const PREGAME_MS = 5 * 60 * 1000; // slow ticking BEFORE the window, just to wake up

const WINDOW_PRE_MS = 60 * 60_000; // active window opens 1h before kickoff
const WINDOW_POST_MS = 4 * 60 * 60_000; // …and closes ~4h after

/**
 * How often to re-poll the detail page, or `false` to stop. The API enriches a
 * match across its lifecycle — the lineup lands ~40 min before kickoff, scores/
 * events while live, and stats/ratings a few minutes AFTER full-time — so we poll
 * fast while live and gently in the [-1h, +4h] window around kickoff.
 *
 * BEFORE that window we must NOT return `false`: React Query would clear the
 * interval, and with no fetch to re-evaluate it, the page would never start
 * polling as kickoff approaches — it'd sit frozen (no lineups) until a manual
 * reload. So we keep a slow tick that wakes the page INTO the window on its own.
 * `now` is injectable for tests.
 */
export function pollInterval(m: MatchDetail | null | undefined, now = Date.now()): number | false {
  if (!m) return LIVE_MS; // first load still pending — keep trying
  if (m.status === "live") return LIVE_MS;
  if (m.status === "postponed") return false;
  const ko = new Date(m.kickoff).getTime();
  const windowStart = ko - WINDOW_PRE_MS;
  const windowEnd = ko + WINDOW_POST_MS;
  if (now > windowEnd) return false; // long over — nothing new ever lands
  if (now >= windowStart) return SETTLE_MS; // pre-match lineups / live / post-match
  // Still upcoming: tick slowly toward the window so we're polling by the time
  // lineups publish. Capped so a match days away doesn't hammer our API; when the
  // window is near, wake exactly at its start.
  return Math.min(windowStart - now, PREGAME_MS);
}

/** Fetch a single match by id for its detail page. Cached so back-navigation is
 *  instant, and refreshed in place while the match is live or still settling. */
export function useMatch(id: number) {
  const q = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id),
    staleTime: 15_000,
    refetchInterval: (query) => pollInterval(query.state.data),
  });

  // `isPending` is only true on the first load with no cached data — a revisit
  // renders the cached match instantly. Surface an error only when we have none.
  return { match: q.data ?? null, loading: q.isPending, error: q.isError && !q.data };
}

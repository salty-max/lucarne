import { useQuery } from "@tanstack/react-query";
import { fetchMatch } from "@/api";
import type { MatchDetail } from "@lucarne/shared";

const LIVE_MS = 30 * 1000; // snappy while the match is on (goals/events)
const SETTLE_MS = 60 * 1000; // pre-match (lineups) + post-match (stats/ratings)

/**
 * How often to re-poll the detail page, or `false` to stop. The API enriches a
 * match across its lifecycle — the lineup lands ~40 min before kickoff, scores/
 * events while live, and stats/ratings a few minutes AFTER full-time — so we poll
 * fast while live and more gently from an hour before kickoff until ~4h after.
 * Outside that (a match days away, or long over) there's nothing new to fetch.
 */
function pollInterval(m: MatchDetail | null | undefined): number | false {
  if (!m) return LIVE_MS; // first load still pending — keep trying
  if (m.status === "live") return LIVE_MS;
  if (m.status === "postponed") return false;
  const ko = new Date(m.kickoff).getTime();
  const now = Date.now();
  return now >= ko - 60 * 60_000 && now <= ko + 4 * 60 * 60_000 ? SETTLE_MS : false;
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

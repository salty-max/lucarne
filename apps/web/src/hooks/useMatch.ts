import { useQuery } from "@tanstack/react-query";
import { fetchMatch } from "@/api";
import type { MatchDetail } from "@lucarne/shared";

const POLL_MS = 60 * 1000;

/**
 * Whether the detail page is worth re-polling right now. The API enriches a match
 * across its lifecycle — the lineup lands ~40 min before kickoff, scores/events
 * while live, and stats/ratings a few minutes AFTER full-time — so we poll from
 * an hour before kickoff until ~4h after, plus any time it's live. Outside that
 * window (a match days away, or long over) there's nothing new to fetch.
 */
function shouldPoll(m: MatchDetail | null | undefined): boolean {
  if (!m) return true; // first load still pending — keep trying
  if (m.status === "live") return true;
  if (m.status === "postponed") return false;
  const ko = new Date(m.kickoff).getTime();
  const now = Date.now();
  return now >= ko - 60 * 60_000 && now <= ko + 4 * 60 * 60_000;
}

/** Fetch a single match by id for its detail page. Cached so back-navigation is
 *  instant, and refreshed in place while the match is live or still settling. */
export function useMatch(id: number) {
  const q = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id),
    staleTime: 30_000,
    refetchInterval: (query) => (shouldPoll(query.state.data) ? POLL_MS : false),
  });

  // `isPending` is only true on the first load with no cached data — a revisit
  // renders the cached match instantly. Surface an error only when we have none.
  return { match: q.data ?? null, loading: q.isPending, error: q.isError && !q.data };
}

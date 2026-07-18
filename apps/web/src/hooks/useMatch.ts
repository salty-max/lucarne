import { useEffect, useRef, useState } from "react";
import { fetchMatch } from "@/api";
import type { MatchDetail } from "@lucarne/shared";

type State = { match: MatchDetail | null; loading: boolean; error: boolean };

const POLL_MS = 60 * 1000;

/**
 * Whether the detail page is worth re-polling right now. The API enriches a match
 * across its lifecycle — the lineup lands ~40 min before kickoff, scores/events
 * while live, and stats/ratings a few minutes AFTER full-time — so we poll from
 * an hour before kickoff until ~4h after, plus any time it's live. Outside that
 * window (a match days away, or long over) there's nothing new to fetch.
 */
function shouldPoll(m: MatchDetail | null): boolean {
  if (!m) return true; // first load still pending — keep trying
  if (m.status === "live") return true;
  if (m.status === "postponed") return false;
  const ko = new Date(m.kickoff).getTime();
  const now = Date.now();
  return now >= ko - 60 * 60_000 && now <= ko + 4 * 60 * 60_000;
}

/** Fetch a single match by id for its detail page, refreshing in place while the
 *  match is live or still settling so new data appears without a reload. */
export function useMatch(id: number) {
  const [state, setState] = useState<State>({ match: null, loading: true, error: false });
  const matchRef = useRef<MatchDetail | null>(null);

  useEffect(() => {
    let alive = true;
    matchRef.current = null;

    const load = (initial: boolean) => {
      if (initial) setState({ match: null, loading: true, error: false });
      fetchMatch(id)
        .then((match) => {
          if (!alive) return;
          matchRef.current = match;
          setState({ match, loading: false, error: false });
        })
        .catch(() => {
          // Keep a match already on screen; only surface an error if we have none.
          if (alive) setState((s) => ({ ...s, loading: false, error: !s.match }));
        });
    };

    load(true);
    const timer = setInterval(() => {
      if (alive && shouldPoll(matchRef.current)) load(false);
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);

  return state;
}

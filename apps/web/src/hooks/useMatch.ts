import { useEffect, useState } from "react";
import { fetchMatch } from "@/api";
import type { MatchDetail } from "@lucarne/shared";

type State = { match: MatchDetail | null; loading: boolean; error: boolean };

/** Fetch a single match by id for its detail page. */
export function useMatch(id: number) {
  const [state, setState] = useState<State>({ match: null, loading: true, error: false });

  useEffect(() => {
    let alive = true;
    setState({ match: null, loading: true, error: false });
    fetchMatch(id)
      .then((match) => alive && setState({ match, loading: false, error: false }))
      .catch(() => alive && setState({ match: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}

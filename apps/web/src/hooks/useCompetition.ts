import { useEffect, useState } from "react";
import { fetchCompetition } from "@/api";
import type { CompetitionDetail } from "@lucarne/shared";

type State = { detail: CompetitionDetail | null; loading: boolean; error: boolean };

/** Fetch one competition's tables + knockout bracket for its page. */
export function useCompetition(slug: string) {
  const [state, setState] = useState<State>({ detail: null, loading: true, error: false });

  useEffect(() => {
    let alive = true;
    setState({ detail: null, loading: true, error: false });
    fetchCompetition(slug)
      .then((detail) => alive && setState({ detail, loading: false, error: false }))
      .catch(() => alive && setState({ detail: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, [slug]);

  return state;
}

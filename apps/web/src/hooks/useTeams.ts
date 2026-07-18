import { useEffect, useState } from "react";
import { fetchTeams } from "@/api";
import type { TeamOption } from "@lucarne/shared";

/** Fetch the full team list once, for the "My teams" follow picker. */
export function useTeams() {
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTeams()
      .then((t) => alive && setTeams(t))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  return { teams, error };
}

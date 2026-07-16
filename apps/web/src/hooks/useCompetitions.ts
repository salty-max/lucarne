import { useEffect, useState } from "react";
import { fetchCompetitions } from "@/api";
import type { CompetitionInfo } from "@lucarne/shared";

export function useCompetitions() {
  const [competitions, setCompetitions] = useState<CompetitionInfo[] | null>(null);
  useEffect(() => {
    fetchCompetitions()
      .then(setCompetitions)
      .catch(() => setCompetitions([]));
  }, []);
  return competitions;
}

import { useQuery } from "@tanstack/react-query";
import { fetchTeams } from "@/api";

/** Fetch the full team list once (cached hard), for the "My teams" follow picker. */
export function useTeams() {
  const q = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    staleTime: 30 * 60_000,
  });
  return { teams: q.data ?? null, error: q.isError };
}

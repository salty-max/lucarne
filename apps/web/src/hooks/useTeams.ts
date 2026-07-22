import { useQuery } from "@tanstack/react-query";
import { fetchTeams } from "@/api";

/** The team list for the "My teams" follow picker. Uses the default 60s staleTime
 *  + refetch-on-focus (not a hard 30-min cache), so a newly added competition's
 *  teams — e.g. the J3 League — show up in search without reinstalling the PWA. */
export function useTeams() {
  const q = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
  });
  return { teams: q.data ?? null, error: q.isError };
}

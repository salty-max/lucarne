import { useQuery } from "@tanstack/react-query";
import { fetchCompetitions } from "@/api";

/** The competition list — rarely changes, so cache it hard. Returns `null` while
 *  first loading, `[]` on error (routes treat `null` as loading). */
export function useCompetitions() {
  const q = useQuery({
    queryKey: ["competitions"],
    queryFn: fetchCompetitions,
    staleTime: 30 * 60_000,
  });
  return q.isError ? [] : (q.data ?? null);
}

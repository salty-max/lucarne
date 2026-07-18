import { useQuery } from "@tanstack/react-query";
import { fetchCompetition } from "@/api";

/** Fetch one competition's tables + knockout bracket for its page. Cached, so
 *  re-opening a competition (or tab-hopping back) is instant. */
export function useCompetition(slug: string) {
  const q = useQuery({
    queryKey: ["competition", slug],
    queryFn: () => fetchCompetition(slug),
    staleTime: 60_000,
  });
  return { detail: q.data ?? null, loading: q.isPending, error: q.isError };
}

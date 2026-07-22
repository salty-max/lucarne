import { useQuery } from "@tanstack/react-query";
import { fetchCompetitions } from "@/api";

/** The competition list. Uses the default 60s staleTime + refetch-on-focus so a
 *  new competition (or a rename) appears when you reopen the app — important on an
 *  installed PWA where you can't hard-refresh. It changes rarely, but the endpoint
 *  is tiny, so revalidating on focus costs next to nothing. Returns `null` while
 *  first loading, `[]` on error (routes treat `null` as loading). */
export function useCompetitions() {
  const q = useQuery({
    queryKey: ["competitions"],
    queryFn: fetchCompetitions,
  });
  return q.isError ? [] : (q.data ?? null);
}

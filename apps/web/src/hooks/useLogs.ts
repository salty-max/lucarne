import { useQuery } from "@tanstack/react-query";
import { fetchLogs } from "@/api";

const REFRESH_MS = 30 * 1000;

/** Fetch the scheduled-job history, refreshing every 30s so new cron runs appear
 *  while the page is open. Always revalidates (staleTime 0) but keeps the last
 *  list on screen while doing so. */
export function useLogs(limit = 100) {
  const q = useQuery({
    queryKey: ["logs", limit],
    queryFn: () => fetchLogs(limit),
    staleTime: 0,
    refetchInterval: REFRESH_MS,
  });
  return { runs: q.data ?? null, error: q.isError };
}

import { useQuery } from "@tanstack/react-query";
import { fetchLive } from "@/api";

/** Global count of currently-live tracked matches, for the header. Shares the
 *  `live` query with Today/broadcasters, so the 30s poll runs once app-wide. */
export function useLiveCount() {
  const q = useQuery({
    queryKey: ["live"],
    queryFn: fetchLive,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  return (q.data ?? []).filter((m) => m.status === "live").length;
}

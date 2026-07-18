import { QueryClient } from "@tanstack/react-query";

/** Shared query cache for the whole app.
 *
 *  Defaults tuned for a schedule app on free-tier hosting:
 *  - `staleTime` 60s: revisiting a page you saw <60s ago serves the cached data
 *    with no refetch at all. Even when stale, a cached page renders instantly and
 *    revalidates in the background — so navigation almost never shows a skeleton
 *    after the first cold load.
 *  - `gcTime` 30min: keep unused data around long enough to make back-navigation
 *    and tab-hopping instant.
 *  - `refetchOnWindowFocus`: refresh when the (installed) app regains focus, so
 *    reopening the PWA shows fresh fixtures — without a skeleton, since the cached
 *    data stays on screen while it revalidates.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

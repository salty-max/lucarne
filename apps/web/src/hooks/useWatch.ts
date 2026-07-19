import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WatchListResponse } from "@lucarne/shared";
import { fetchWatchList, setWatch } from "@/api";
import { getDeviceId } from "@/lib/device";
import { useFavorites } from "@/lib/favorites";

/** Minimal shape needed to resolve/toggle a match's surveillance. */
export type WatchableMatch = {
  id: number;
  home: { name: string };
  away: { name: string };
};

const EMPTY: WatchListResponse = { on: [], off: [] };

/**
 * Active surveillance ("radar") state for the current device. A match is watched
 * if it's explicitly "on", or (no explicit decision) a followed team plays; an
 * explicit "off" mutes it, overriding the follow. `toggle` flips it with an
 * optimistic cache update so the switch responds instantly.
 */
export function useWatch() {
  const deviceId = getDeviceId();
  const favorites = useFavorites();
  const qc = useQueryClient();
  const key = ["watch", deviceId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchWatchList(deviceId),
    staleTime: 60_000,
  });

  const on = new Set(data?.on ?? EMPTY.on);
  const off = new Set(data?.off ?? EMPTY.off);
  const favSet = new Set(favorites);

  const isFollowed = (m: WatchableMatch) => favSet.has(m.home.name) || favSet.has(m.away.name);
  const isWatched = (m: WatchableMatch) =>
    on.has(m.id) ? true : off.has(m.id) ? false : isFollowed(m);

  const toggle = async (m: WatchableMatch) => {
    const next: "on" | "off" = isWatched(m) ? "off" : "on";
    qc.setQueryData<WatchListResponse>(key, (prev) => {
      const onS = new Set(prev?.on ?? []);
      const offS = new Set(prev?.off ?? []);
      if (next === "on") {
        onS.add(m.id);
        offS.delete(m.id);
      } else {
        offS.add(m.id);
        onS.delete(m.id);
      }
      return { on: [...onS], off: [...offS] };
    });
    try {
      await setWatch(deviceId, m.id, next);
    } catch {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  return { isWatched, isFollowed, toggle };
}

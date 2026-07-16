import { useEffect, useState } from "react";
import { fetchLive } from "@/api";

/** Global count of currently-live tracked matches (polled), for the header. */
export function useLiveCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const matches = await fetchLive();
      if (alive) setCount(matches.filter((m) => m.status === "live").length);
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return count;
}

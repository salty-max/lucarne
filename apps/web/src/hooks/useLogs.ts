import { useEffect, useState } from "react";
import { fetchLogs } from "@/api";
import type { RunLogEntry } from "@lucarne/shared";

const REFRESH_MS = 30 * 1000;

/** Fetch the scheduled-job history, refreshing every 30s so new cron runs
 *  appear while the page is open. */
export function useLogs(limit = 100) {
  const [runs, setRuns] = useState<RunLogEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchLogs(limit)
        .then((r) => {
          if (!alive) return;
          setRuns(r);
          setError(false);
        })
        .catch(() => alive && setError(true));

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit]);

  return { runs, error };
}

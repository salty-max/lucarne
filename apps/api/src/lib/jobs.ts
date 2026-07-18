import { log } from "@/lib/log";
import { recordRun } from "@/lib/runlog";

/**
 * Run a scheduled job with uniform observability: time it, log one structured
 * line, and persist the outcome to `run_log`. `worthLogging` decides whether a
 * result is meaningful enough to emit — it skips the no-op ticks that dominate a
 * per-minute cron (e.g. a live poll that didn't spend a request), so both the log
 * stream and the table stay signal-rich. Errors are always logged + recorded and
 * swallowed, so one failing job never blocks the others sharing the tick.
 */
export async function runJob<T>(
  job: string,
  fn: () => Promise<T>,
  worthLogging: (r: T) => boolean = () => true,
): Promise<void> {
  const started = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - started;
    if (!worthLogging(result)) return;
    const detail = result as Record<string, unknown>;
    log.info(job, { ...detail, ms });
    await recordRun({ job, ok: true, detail, ms });
  } catch (err) {
    const ms = Date.now() - started;
    log.error(job, { err: String(err), ms });
    await recordRun({ job, ok: false, detail: { err: String(err) }, ms });
  }
}

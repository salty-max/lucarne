import { desc, lt } from "drizzle-orm";
import { db } from "@/db";
import { runLog } from "@/db/schema";
import { log } from "@/lib/log";

/** Keep a rolling week of run entries — enough to answer "what happened last
 *  night / during the match?" without letting the table grow unbounded. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persist a scheduled-job outcome to `run_log` so the cron history is queryable
 * from the app itself (not just ephemeral the run_log table output). Best-effort:
 * a failed write is logged and swallowed so it never breaks the job that called
 * it. Only meaningful runs are recorded (the caller decides), so the table stays
 * signal-rich rather than one no-op row per minute.
 */
export async function recordRun(entry: {
  job: string;
  ok: boolean;
  detail?: Record<string, unknown> | null;
  ms?: number | null;
}): Promise<void> {
  try {
    await db.insert(runLog).values({
      at: new Date(),
      job: entry.job,
      ok: entry.ok,
      detail: entry.detail ?? null,
      ms: entry.ms ?? null,
    });
    await db.delete(runLog).where(lt(runLog.at, new Date(Date.now() - KEEP_MS)));
  } catch (err) {
    log.error("runlog.write", { err: String(err) });
  }
}

/** The most recent run entries, newest first — backs the /api/cron/log endpoint. */
export function recentRuns(limit = 50): Promise<(typeof runLog.$inferSelect)[]> {
  return db.select().from(runLog).orderBy(desc(runLog.at)).limit(limit);
}

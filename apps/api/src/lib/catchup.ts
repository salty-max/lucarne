import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runLog } from "@/db/schema";
import { runJob } from "@/lib/jobs";

/** A scheduled job that must not silently skip its slot. */
export type CatchUpJob = {
  job: string; // must match the name used by its cron runJob(), so run_log lines up
  maxAgeMs: number; // overdue once the last attempt is older than this
  run: () => Promise<unknown>;
};

const HOUR = 60 * 60_000;

/**
 * The daily/weekly slots that must survive the host being asleep (or a platform
 * trigger being missed), with the thresholds defined once so the Node scheduler
 * and the Worker can't drift apart. Names mirror the cron jobs so `run_log` is a
 * shared source of truth; each threshold sits just above its period, so a cron
 * firing normally never causes a second run.
 */
export function standardCatchUp(deps: {
  sync: () => Promise<unknown>;
  details: () => Promise<unknown>;
  resync: () => Promise<unknown>;
}): CatchUpJob[] {
  return [
    { job: "sync", maxAgeMs: 25 * HOUR, run: deps.sync },
    { job: "details", maxAgeMs: 25 * HOUR, run: deps.details },
    { job: "resync", maxAgeMs: 8 * 24 * HOUR, run: deps.resync },
  ];
}

/**
 * Heal a schedule that was slept through.
 *
 * cron only fires if the process is awake at that exact minute. A laptop that
 * sleeps at 05:00 (or a platform trigger that gets missed) silently skips the
 * nightly sync and the data just goes stale until the next day — node-cron
 * reports "missed execution" and moves on, it never catches up. So on every live
 * tick we ask when each daily/weekly job last *attempted* to run, and fire the
 * overdue ones.
 *
 * Gating on the last ATTEMPT rather than the last success is deliberate: a job
 * that keeps failing then retries once per period instead of hammering the API
 * every minute. Thresholds sit just above each job's period, so a cron firing
 * normally never double-runs. A job with no entry at all (fresh database, or
 * pruned from the 7-day run_log) counts as overdue — which is what we want.
 *
 * Returns the names it fired, so the caller only logs when something happened.
 */
export async function runCatchUp(jobs: CatchUpJob[], now = new Date()): Promise<string[]> {
  const rows = await db
    .select({ job: runLog.job, at: runLog.at })
    .from(runLog)
    .where(
      inArray(
        runLog.job,
        jobs.map((j) => j.job),
      ),
    )
    .orderBy(desc(runLog.at));

  const lastAttempt = new Map<string, Date>();
  for (const r of rows) if (!lastAttempt.has(r.job)) lastAttempt.set(r.job, r.at);

  const fired: string[] = [];
  for (const j of jobs) {
    const at = lastAttempt.get(j.job);
    if (at && now.getTime() - at.getTime() < j.maxAgeMs) continue;
    fired.push(j.job);
    // Runs under its own name so run_log records it and the next tick sees it.
    await runJob(j.job, j.run);
  }
  return fired;
}

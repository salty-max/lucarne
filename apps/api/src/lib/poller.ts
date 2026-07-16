import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import {
  applyLiveUpdate,
  storeMatchEvents,
  syncFixtures,
  type SyncResult,
} from "@/lib/ingest";
import {
  budgetRemaining,
  candidateKickoffRange,
  decideLivePoll,
  liveWindow,
  loadBudget,
  saveBudget,
} from "@/lib/live";
import type { ScheduleCache } from "@/lib/scheduleCache";

export type LiveTickResult = {
  polled: boolean;
  reason?: string;
  updated?: number;
  live: number;
  budgetRemaining: number;
  nextIntervalMs?: number;
};

/**
 * One live-poll tick. Window-gates + budget-throttles, so calling it every
 * ~2 min is safe: most ticks return `polled: false` and cost ZERO requests.
 */
export async function runLivePollTick(
  now = new Date(),
  cache?: ScheduleCache,
): Promise<LiveTickResult> {
  const nowMs = now.getTime();

  // KV/in-memory gate: if we know the day's windows and none is live right now,
  // return WITHOUT touching the DB or the API. A null result (cold cache) falls
  // through to the DB query below — correct, just not as cheap.
  const windows = await cache?.getWindows();
  if (windows && !windows.some((w) => nowMs >= w.start && nowMs <= w.end)) {
    return { polled: false, reason: "no-window", live: 0, budgetRemaining: -1 };
  }

  const { earliest, latest } = candidateKickoffRange(nowMs);
  const candidates = await db
    .select({ kickoff: matches.kickoff })
    .from(matches)
    .where(
      and(
        gte(matches.kickoff, earliest),
        lte(matches.kickoff, latest),
        inArray(matches.status, ["scheduled", "live"]),
      ),
    );

  const liveCount = candidates.length;
  const windowEndMs = liveCount
    ? Math.max(...candidates.map((c) => liveWindow(c.kickoff).end))
    : null;

  const state = await loadBudget(nowMs);
  const decision = decideLivePoll({ nowMs, liveCount, windowEndMs, state });

  if (!decision.poll) {
    return { polled: false, reason: decision.reason, live: liveCount, budgetRemaining: decision.budgetRemaining };
  }

  const { updated } = await applyLiveUpdate();
  const next = {
    utcDate: state.utcDate,
    requestsToday: state.requestsToday + 1,
    lastPollAt: now.toISOString(),
  };
  await saveBudget(next);

  return {
    polled: true,
    updated,
    live: liveCount,
    nextIntervalMs: Math.round(decision.intervalMs),
    budgetRemaining: budgetRemaining(next),
  };
}

/** Daily fixture sync (~7 API requests), counted against the shared budget.
 *  Also refreshes the live-window cache used to gate the live poller. */
export async function runFixtureSync(cache?: ScheduleCache): Promise<SyncResult> {
  const result = await syncFixtures();
  const state = await loadBudget(Date.now());
  await saveBudget({ ...state, requestsToday: state.requestsToday + result.requestsUsed });
  if (cache) await refreshWindowCache(cache);
  return result;
}

/** Recompute the upcoming live windows and store them for the gate. */
async function refreshWindowCache(cache: ScheduleCache): Promise<void> {
  const nowMs = Date.now();
  const from = new Date(nowMs - 3 * 60 * 60 * 1000);
  const to = new Date(nowMs + 36 * 60 * 60 * 1000);
  const rows = await db
    .select({ kickoff: matches.kickoff })
    .from(matches)
    .where(
      and(
        gte(matches.kickoff, from),
        lte(matches.kickoff, to),
        inArray(matches.status, ["scheduled", "live"]),
      ),
    );
  await cache.setWindows(rows.map((r) => liveWindow(r.kickoff)));
}

export type DrainResult = {
  matches: number; // matches detailed this run
  events: number; // events stored this run
  budgetRemaining: number;
};

/**
 * Post-match details drain. Fetches events (scorers/cards) for finished matches
 * that don't have them yet, one request each, capped by `maxMatches` (Workers
 * subrequest limit) and the remaining daily budget. Because finished-match
 * events are immutable, any leftover backlog simply drains on a later run — so
 * this runs cheaply overnight in a fresh budget bucket.
 *
 * `sinceDays` bounds how far back we chase (default 3 — the cron only wants
 * recently-finished games). Pass `null` to drain the entire backlog, e.g. a
 * one-time backfill of a tournament's history.
 */
export async function runDetailsDrain(
  maxMatches = 10,
  { sinceDays = 3 }: { sinceDays?: number | null } = {},
): Promise<DrainResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  if (remaining <= 0) return { matches: 0, events: 0, budgetRemaining: 0 };

  const cutoff = sinceDays == null ? null : new Date(nowMs - sinceDays * 24 * 60 * 60 * 1000);
  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const candidates = await db
    .select({
      id: matches.id,
      apiFootballId: matches.apiFootballId,
      homeTeamId: matches.homeTeamId,
      homeApiId: home.apiFootballId,
      awayTeamId: matches.awayTeamId,
      awayApiId: away.apiFootballId,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(
      and(
        eq(matches.status, "finished"),
        isNull(matches.detailsFetchedAt),
        cutoff ? gte(matches.kickoff, cutoff) : undefined,
      ),
    )
    .orderBy(desc(matches.kickoff))
    .limit(Math.min(maxMatches, remaining));

  let events = 0;
  let count = 0;
  for (const m of candidates) {
    if (remaining <= 0) break;
    try {
      events += await storeMatchEvents(m);
      remaining -= 1;
      count += 1;
    } catch (err) {
      console.error("[details] match", m.id, err);
    }
  }

  const next = { ...state, requestsToday: state.requestsToday + count };
  await saveBudget(next);
  return { matches: count, events, budgetRemaining: budgetRemaining(next) };
}

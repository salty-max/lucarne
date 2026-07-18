import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import {
  applyLiveUpdate,
  backfillFixtures,
  storeMatchEvents,
  storeMatchLineups,
  storeMatchPlayerRatings,
  storeMatchStatistics,
  syncAllStandings,
  syncFixtures,
  type SyncResult,
} from "@/lib/ingest";
import { COMPETITIONS, currentSeason } from "@/lib/competitions";
import {
  budgetRemaining,
  candidateKickoffRange,
  decideLivePoll,
  liveWindow,
  loadBudget,
  saveBudget,
} from "@/lib/live";
import { log } from "@/lib/log";
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

/** Daily fixture + standings sync (~7 + ~10 API requests), counted against the
 *  shared budget. League tables refresh on the same daily cadence (one request
 *  per competition, cheap and idempotent) so standings are never more than a day
 *  stale, and a table that only appears mid-season (e.g. Ligue 2 once the API
 *  publishes it) surfaces within a day. Also refreshes the live-window cache. */
export async function runFixtureSync(cache?: ScheduleCache): Promise<SyncResult> {
  const result = await syncFixtures();
  const tables = await syncAllStandings();
  const state = await loadBudget(Date.now());
  await saveBudget({
    ...state,
    requestsToday: state.requestsToday + result.requestsUsed + tables.requestsUsed,
  });
  if (cache) await refreshWindowCache(cache);
  return result;
}

/**
 * Weekly full-season re-sync. The daily sync only covers a rolling ~17-day
 * window, so fixtures confirmed after a draw — e.g. the UEFA league-phase
 * matchdays set in late August — wouldn't surface until they entered that
 * window. This refetches every competition's WHOLE season (one request each,
 * ~10 total) and upserts it, landing the full calendar in one pass. Upserts run
 * per-competition to keep each batch bounded; the cost counts against the
 * shared daily budget (idempotent, so a mid-run failure just retries next week).
 * (Standings ride the daily sync — see `runFixtureSync` — not this pass.)
 */
export async function runFullResync(cache?: ScheduleCache): Promise<SyncResult> {
  const season = currentSeason();
  const from = `${season}-07-01`;
  const to = `${season + 1}-06-30`;

  let fixtures = 0;
  let requestsUsed = 0;
  for (const comp of COMPETITIONS) {
    try {
      fixtures += await backfillFixtures(comp.apiFootballId, comp.season ?? season, from, to);
    } catch (err) {
      log.warn("resync.competition.fail", { slug: comp.slug, err: String(err) });
    }
    requestsUsed += 1; // one request per competition, success or not
  }

  const state = await loadBudget(Date.now());
  await saveBudget({ ...state, requestsToday: state.requestsToday + requestsUsed });
  if (cache) await refreshWindowCache(cache);
  return { competitions: COMPETITIONS.length, fixtures, requestsUsed };
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
  matches: number; // matches touched this run
  events: number; // events stored this run
  lineups: number; // lineup rows stored this run
  stats: number; // matches with statistics stored this run
  ratings: number; // matches with player ratings stored this run
  budgetRemaining: number;
};

/**
 * Post-match details drain. For finished matches still missing them, fetches
 * events (scorers/cards), lineups, team statistics and player ratings — one
 * request each — capped by `maxMatches` and the remaining daily budget.
 *
 * `sinceMs` bounds how far back we chase (default 3 days — the nightly backstop).
 * The eager path (live cadence) passes a short window of a few hours so it only
 * chases freshly-finished games, together with `stampWhenEmpty: false` so stats
 * and ratings that publish minutes after full-time are retried until they land,
 * not stamped empty. Pass `sinceMs: null` to drain the entire backlog (one-time
 * backfill). The nightly default (`stampWhenEmpty: true`) closes out any match
 * the API never provides data for, so nothing is chased forever.
 */
export async function runDetailsDrain(
  maxMatches = 10,
  {
    sinceMs = 3 * 24 * 60 * 60 * 1000,
    stampWhenEmpty = true,
  }: { sinceMs?: number | null; stampWhenEmpty?: boolean } = {},
): Promise<DrainResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  if (remaining <= 0)
    return { matches: 0, events: 0, lineups: 0, stats: 0, ratings: 0, budgetRemaining: 0 };

  const cutoff = sinceMs == null ? null : new Date(nowMs - sinceMs);
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
      hasDetails: matches.detailsFetchedAt,
      hasLineups: matches.lineupsFetchedAt,
      hasStats: matches.statsFetchedAt,
      hasRatings: matches.ratingsFetchedAt,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(
      and(
        eq(matches.status, "finished"),
        or(
          isNull(matches.detailsFetchedAt),
          isNull(matches.lineupsFetchedAt),
          isNull(matches.statsFetchedAt),
          isNull(matches.ratingsFetchedAt),
        ),
        cutoff ? gte(matches.kickoff, cutoff) : undefined,
      ),
    )
    .orderBy(desc(matches.kickoff))
    .limit(maxMatches);

  let events = 0;
  let lineups = 0;
  let stats = 0;
  let ratings = 0;
  let requests = 0;
  let count = 0;
  for (const m of candidates) {
    if (remaining <= 0) break;
    let touched = false;
    if (m.hasDetails == null && remaining > 0) {
      try {
        events += await storeMatchEvents(m, { stampWhenEmpty });
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.events.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasLineups == null && remaining > 0) {
      try {
        lineups += await storeMatchLineups(m, { stampWhenEmpty });
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.lineups.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasStats == null && remaining > 0) {
      try {
        stats += (await storeMatchStatistics(m, { stampWhenEmpty })) > 0 ? 1 : 0;
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.stats.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasRatings == null && remaining > 0) {
      try {
        ratings += (await storeMatchPlayerRatings(m, { stampWhenEmpty })) > 0 ? 1 : 0;
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.ratings.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (touched) count += 1;
  }

  const next = { ...state, requestsToday: state.requestsToday + requests };
  await saveBudget(next);
  return { matches: count, events, lineups, stats, ratings, budgetRemaining: budgetRemaining(next) };
}

/**
 * Eager post-match drain, folded into the live cadence (every minute). Chases
 * only games that finished in the last few hours and — crucially — does NOT
 * stamp empty stats/ratings (`stampWhenEmpty: false`), so the ones that publish
 * minutes after full-time are retried until they land. Time-bounded, so a fixture
 * the API never enriches isn't chased forever — the nightly `runDetailsDrain`
 * (which stamps) closes it out.
 */
export function runEagerDrain(): Promise<DrainResult> {
  return runDetailsDrain(8, { sinceMs: 5 * 60 * 60 * 1000, stampWhenEmpty: false });
}

export type LiveEnrichResult = {
  matches: number;
  events: number;
  stats: number;
  budgetRemaining: number;
};

/**
 * In-play enrichment, folded into the live cadence. For matches currently live it
 * refreshes events (scorers/cards) and team statistics every tick WITHOUT stamping
 * (`stamp: false`) — the detail page shows them in near-real-time, while the
 * post-match drain still does the final authoritative, stamped fetch at full-time.
 * Budget-gated; ~2 requests per live match per tick, capped by `maxMatches`.
 * (`live=all` carries only the scoreboard, so events + statistics each need their
 * own endpoint — hence the per-match cost.)
 */
export async function runLiveEnrich(maxMatches = 12): Promise<LiveEnrichResult> {
  const nowMs = Date.now();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  if (remaining <= 0) return { matches: 0, events: 0, stats: 0, budgetRemaining: 0 };

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
    .where(eq(matches.status, "live"))
    .limit(maxMatches);

  const opts = { stamp: false, stampWhenEmpty: false } as const;
  let events = 0;
  let stats = 0;
  let requests = 0;
  let count = 0;
  for (const m of candidates) {
    if (remaining <= 0) break;
    let touched = false;
    try {
      events += await storeMatchEvents(m, opts);
      remaining -= 1;
      requests += 1;
      touched = true;
    } catch (err) {
      log.warn("live-enrich.events.fail", { matchId: m.id, err: String(err) });
    }
    if (remaining > 0) {
      try {
        stats += (await storeMatchStatistics(m, opts)) > 0 ? 1 : 0;
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("live-enrich.stats.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (touched) count += 1;
  }

  const next = { ...state, requestsToday: state.requestsToday + requests };
  await saveBudget(next);
  return { matches: count, events, stats, budgetRemaining: budgetRemaining(next) };
}

export type LineupPollResult = { matches: number; lineups: number; budgetRemaining: number };

/**
 * Pre-match lineup poll. Confirmed lineups publish on API-Football ~40 min before
 * kickoff, so this grabs them for scheduled/live matches kicking off soon that
 * don't have them yet. Runs on the live cadence (every ~2 min in-window),
 * budget-gated (1 request each). An empty response (not published yet) is left
 * un-stamped, so a later tick retries once the XI is announced.
 */
export async function runLineupPoll(maxMatches = 12): Promise<LineupPollResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  if (remaining <= 0) return { matches: 0, lineups: 0, budgetRemaining: 0 };

  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const from = new Date(nowMs - 15 * 60_000); // small buffer for just-kicked-off games
  const to = new Date(nowMs + 60 * 60_000); // pre-match publish window (~40 min out, + margin)

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
        inArray(matches.status, ["scheduled", "live"]),
        isNull(matches.lineupsFetchedAt),
        gte(matches.kickoff, from),
        lte(matches.kickoff, to),
      ),
    )
    .orderBy(asc(matches.kickoff))
    .limit(maxMatches);

  let lineups = 0;
  let requests = 0;
  let count = 0;
  for (const m of candidates) {
    if (remaining <= 0) break;
    try {
      const n = await storeMatchLineups(m, { stampWhenEmpty: false });
      remaining -= 1;
      requests += 1;
      if (n > 0) {
        lineups += n;
        count += 1;
      }
    } catch (err) {
      log.warn("lineups.match.fail", { matchId: m.id, err: String(err) });
    }
  }

  const next = { ...state, requestsToday: state.requestsToday + requests };
  await saveBudget(next);
  return { matches: count, lineups, budgetRemaining: budgetRemaining(next) };
}

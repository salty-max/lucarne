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
  storeMatchPredictions,
  storeMatchStatistics,
  syncAllStandings,
  syncAllTopPlayers,
  syncFixtures,
  type SyncResult,
} from "@/lib/ingest";
import { COMPETITIONS, currentSeason } from "@/lib/competitions";
import {
  LIVE_BUDGET_RESERVE,
  MATCH_DURATION_MS,
  budgetRemaining,
  candidateKickoffRange,
  decideLivePoll,
  liveWindow,
  loadBudget,
  saveBudget,
} from "@/lib/live";
import { log } from "@/lib/log";
import { devicesWatching, loadWatchState } from "@/lib/surveillance";
import type { ScheduleCache } from "@/lib/scheduleCache";

export type LiveTickResult = {
  polled: boolean;
  reason?: string;
  updated?: number;
  finalized?: number;
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

  // Reap stuck-live rows: a match still "live" well past the longest possible
  // match (we missed its live=all drop-off while down) never un-sticks on its
  // own — it shows as live forever AND gets re-enriched every tick. It's outside
  // the candidate window above, so `decision` would skip the poll. Force one so
  // applyLiveUpdate finalises it (authoritative by id, else local force-finish).
  let poll = decision.poll;
  let reason: string = decision.reason;
  if (!poll && decision.budgetRemaining > 0) {
    const stuck = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.status, "live"), lte(matches.kickoff, new Date(nowMs - MATCH_DURATION_MS))))
      .limit(1);
    if (stuck.length > 0) {
      poll = true;
      reason = "reap-stuck";
    }
  }

  if (!poll) {
    return { polled: false, reason, live: liveCount, budgetRemaining: decision.budgetRemaining };
  }

  const { updated, finalized, requests } = await applyLiveUpdate();
  const next = {
    utcDate: state.utcDate,
    requestsToday: state.requestsToday + requests,
    lastPollAt: now.toISOString(),
  };
  await saveBudget(next);

  return {
    polled: true,
    updated,
    finalized,
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
  const top = await syncAllTopPlayers();
  const state = await loadBudget(Date.now());
  await saveBudget({
    ...state,
    requestsToday: state.requestsToday + result.requestsUsed + tables.requestsUsed + top.requestsUsed,
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
    reserve = 0,
  }: { sinceMs?: number | null; stampWhenEmpty?: boolean; reserve?: number } = {},
): Promise<DrainResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  // `reserve` keeps the day-time eager drain off the budget floor reserved for
  // live scores; the nightly drain passes 0 (it may use the whole fresh bucket).
  if (remaining <= reserve)
    return { matches: 0, events: 0, lineups: 0, stats: 0, ratings: 0, budgetRemaining: remaining };

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
    if (remaining <= reserve) break;
    let touched = false;
    if (m.hasDetails == null && remaining > reserve) {
      try {
        events += await storeMatchEvents(m, { stampWhenEmpty });
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.events.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasLineups == null && remaining > reserve) {
      try {
        lineups += await storeMatchLineups(m, { stampWhenEmpty });
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.lineups.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasStats == null && remaining > reserve) {
      try {
        stats += (await storeMatchStatistics(m, { stampWhenEmpty })) > 0 ? 1 : 0;
        remaining -= 1;
        requests += 1;
        touched = true;
      } catch (err) {
        log.warn("details.stats.fail", { matchId: m.id, err: String(err) });
      }
    }
    if (m.hasRatings == null && remaining > reserve) {
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
  return runDetailsDrain(8, {
    sinceMs: 5 * 60 * 60 * 1000,
    stampWhenEmpty: false,
    reserve: LIVE_BUDGET_RESERVE, // never eat the budget floor reserved for scores
  });
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
  // Stop before the reserved floor so a mega match day can't drain the pool dry
  // and freeze the live SCORE poll. Enrichment is the sacrificial consumer here —
  // the nightly drain fills whatever it skipped.
  if (remaining <= LIVE_BUDGET_RESERVE)
    return { matches: 0, events: 0, stats: 0, budgetRemaining: remaining };

  const home = alias(teams, "home");
  const away = alias(teams, "away");
  // In-window live matches (a row stuck "live" past the longest match is reaped
  // by runLivePollTick and must never be enriched here — it'd burn 2 req/tick).
  const live = await db
    .select({
      id: matches.id,
      apiFootballId: matches.apiFootballId,
      homeTeamId: matches.homeTeamId,
      homeApiId: home.apiFootballId,
      homeName: home.name,
      awayTeamId: matches.awayTeamId,
      awayApiId: away.apiFootballId,
      awayName: away.name,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(and(eq(matches.status, "live"), gte(matches.kickoff, new Date(nowMs - MATCH_DURATION_MS))));

  if (live.length === 0) return { matches: 0, events: 0, stats: 0, budgetRemaining: remaining };

  // Enrich only matches SOMEONE is monitoring, so a 56-match day stays in budget:
  // per-device effective surveillance (explicit watch ∪ followed team, minus
  // mutes). Ranked by how many devices care, capped at maxMatches.
  const st = await loadWatchState();
  const candidates = live
    .map((m) => ({ m, watchers: devicesWatching(st, m).length }))
    .filter((x) => x.watchers > 0)
    .sort((a, b) => b.watchers - a.watchers)
    .slice(0, maxMatches)
    .map((x) => x.m);

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
  // Reserve floor, like enrich/eager/predictions — the score poll always comes first.
  if (remaining <= LIVE_BUDGET_RESERVE) return { matches: 0, lineups: 0, budgetRemaining: remaining };

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
    if (remaining <= LIVE_BUDGET_RESERVE) break;
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

export type PredictionsPollResult = { matches: number; budgetRemaining: number };

/**
 * Predictions poll. Fetches the pre-match prediction (win %) once for matches in
 * a [-24h, +36h] window around now that don't have one — one request each,
 * stamped so it never re-fetches. Mostly upcoming matches; the 24h look-back also
 * catches recently-finished games that entered the DB already over (the prediction
 * endpoint returns the pre-match odds even after full-time). Budget-gated with the
 * live reserve so it never starves scores; capped per tick, so it drains then idles.
 */
export async function runPredictionsPoll(maxMatches = 20): Promise<PredictionsPollResult> {
  const nowMs = Date.now();
  const state = await loadBudget(nowMs);
  let remaining = budgetRemaining(state);
  if (remaining <= LIVE_BUDGET_RESERVE) return { matches: 0, budgetRemaining: remaining };

  const candidates = await db
    .select({ id: matches.id, apiFootballId: matches.apiFootballId })
    .from(matches)
    .where(
      and(
        isNull(matches.predictionsFetchedAt),
        gte(matches.kickoff, new Date(nowMs - 24 * 60 * 60_000)),
        lte(matches.kickoff, new Date(nowMs + 36 * 60 * 60_000)),
      ),
    )
    .orderBy(asc(matches.kickoff))
    .limit(maxMatches);

  let count = 0;
  let requests = 0;
  for (const m of candidates) {
    if (remaining <= LIVE_BUDGET_RESERVE) break;
    try {
      await storeMatchPredictions(m); // stamps always → one attempt per match
      count += 1;
    } catch (err) {
      log.warn("predictions.match.fail", { matchId: m.id, err: String(err) });
    }
    remaining -= 1;
    requests += 1;
  }

  const next = { ...state, requestsToday: state.requestsToday + requests };
  await saveBudget(next);
  return { matches: count, budgetRemaining: budgetRemaining(next) };
}

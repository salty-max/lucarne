import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncState } from "@/db/schema";

/**
 * Shared daily API budget. The free API-Football plan is 100 requests/day; we
 * cap ourselves a little under that and spend the pool across three consumers:
 *   - fixture sync (~7/day)
 *   - live polling (window-gated, adaptive)
 *   - the post-match details drain (1 request per finished match)
 * All three read/write the SAME per-UTC-day counter, so they self-balance.
 */
export const DAILY_API_BUDGET = 95;

const MATCH_PREROLL_MS = 5 * 60_000; // start watching 5 min before kickoff
const MATCH_DURATION_MS = 150 * 60_000; // covers HT + stoppage + extra time

/** The [start, end] window during which a fixture is considered "live-ish". */
export function liveWindow(kickoff: Date): { start: number; end: number } {
  const t = kickoff.getTime();
  return { start: t - MATCH_PREROLL_MS, end: t + MATCH_DURATION_MS };
}

/**
 * Kickoff range for the DB query that finds currently-live-window matches:
 * a match is live-ish now if its kickoff is within this [earliest, latest].
 */
export function candidateKickoffRange(nowMs: number): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(nowMs - MATCH_DURATION_MS),
    latest: new Date(nowMs + MATCH_PREROLL_MS),
  };
}

/**
 * Adaptive base cadence: poll faster when many matches overlap (goals cluster),
 * slower when a single match is on. Same daily budget, better freshness when it
 * actually matters.
 */
function baseIntervalMs(liveCount: number): number {
  if (liveCount >= 4) return 3 * 60_000;
  if (liveCount >= 2) return 5 * 60_000;
  return 8 * 60_000;
}

export type BudgetState = {
  utcDate: string; // YYYY-MM-DD (UTC) — the counter resets when this rolls over
  requestsToday: number;
  lastPollAt: string | null; // ISO — only used for live-poll throttling
};

export function budgetRemaining(state: BudgetState): number {
  return Math.max(0, DAILY_API_BUDGET - state.requestsToday);
}

export type PollDecision = {
  poll: boolean;
  reason: "poll" | "no-live" | "budget-exhausted" | "throttled";
  intervalMs: number;
  budgetRemaining: number;
};

/**
 * Pure decision function — given the current budget and what's live, decide
 * whether this tick should actually spend an API request. This is what lets the
 * cron fire every ~2 min without wasting the budget.
 */
export function decideLivePoll(args: {
  nowMs: number;
  liveCount: number;
  windowEndMs: number | null; // when the last currently-live match should end
  state: BudgetState;
}): PollDecision {
  const { nowMs, liveCount, windowEndMs, state } = args;
  const remaining = budgetRemaining(state);

  if (liveCount === 0) return { poll: false, reason: "no-live", intervalMs: 0, budgetRemaining: remaining };
  if (remaining <= 0) return { poll: false, reason: "budget-exhausted", intervalMs: 0, budgetRemaining: remaining };

  let interval = baseIntervalMs(liveCount);

  // Budget-aware stretch: never burn the day's budget before the live window
  // ends. If the base cadence would run us dry, widen it to spread evenly.
  if (windowEndMs && windowEndMs > nowMs) {
    const evenInterval = (windowEndMs - nowMs) / remaining;
    interval = Math.max(interval, evenInterval);
  }

  const last = state.lastPollAt ? Date.parse(state.lastPollAt) : null;
  if (last !== null && nowMs - last < interval) {
    return { poll: false, reason: "throttled", intervalMs: interval, budgetRemaining: remaining };
  }

  return { poll: true, reason: "poll", intervalMs: interval, budgetRemaining: remaining };
}

const BUDGET_KEY = "api_budget";

export async function loadBudget(nowMs: number): Promise<BudgetState> {
  const rows = await db.select().from(syncState).where(eq(syncState.key, BUDGET_KEY));
  const utcToday = new Date(nowMs).toISOString().slice(0, 10);
  const existing = rows[0]?.value as BudgetState | undefined;
  if (!existing || existing.utcDate !== utcToday) {
    return { utcDate: utcToday, requestsToday: 0, lastPollAt: null };
  }
  return existing;
}

export async function saveBudget(state: BudgetState): Promise<void> {
  await db
    .insert(syncState)
    .values({ key: BUDGET_KEY, value: state })
    .onConflictDoUpdate({ target: syncState.key, set: { value: state } });
}

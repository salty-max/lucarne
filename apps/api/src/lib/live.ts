import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncState } from "@/db/schema";

/**
 * Shared daily API budget. On the API-Football Pro plan (7,500 requests/day) we
 * cap a little under the ceiling and spend the pool across the consumers:
 *   - fixture + standings sync (~17/day)
 *   - live polling (window-gated, ~60s cadence while matches are on)
 *   - pre-match lineup poll + the post-match details drain (eager, near-real-time)
 * All read/write the SAME per-UTC-day counter, so they self-balance and a runaway
 * loop can never blow past the ceiling. It's the only number to touch if the plan
 * changes — bump to ~74000 (Ultra) / ~148000 (Mega).
 */
export const DAILY_API_BUDGET = 7000;

const MATCH_PREROLL_MS = 5 * 60_000; // start watching 5 min before kickoff
// Keep a match "live-ish" for 3.5h after kickoff — long enough to cover HT +
// stoppage + extra time + a late/delayed start, so we're still polling (and can
// finalise it, see applyLiveUpdate) when it actually ends. A match that ends
// normally is finalised the moment it drops out of live=all, well before this.
const MATCH_DURATION_MS = 210 * 60_000;

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
 * Base live cadence. One `/fixtures?live=all` request covers every live match at
 * once and the Pro budget is ample, so we poll at the freshest cadence the cron
 * grain allows — 60s (the cron fires every minute; sub-minute isn't reachable).
 * The budget-aware stretch in `decideLivePoll` still widens this if the day's
 * budget ever runs genuinely low.
 */
function baseIntervalMs(): number {
  return 60_000;
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

  let interval = baseIntervalMs();

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
